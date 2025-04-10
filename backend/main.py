import time

from typing import *
from dataclasses import dataclass, field
from collections import OrderedDict

from flask import Flask, request
from flask_socketio import SocketIO, emit

import stellar_sdk as sdk

import log


@dataclass
class JoinRequest:
    address: str
    username: str

    @property
    def valid(self) -> bool:
        return (
            sdk.strkey.StrKey.decode_ed25519_public_key(self.address)
            and self.username != ""
        )

    def __repr__(self) -> str:
        return f"<Join {self.username} {self.address[:6]}...>"

    def __hash__(self):
        return hash(self.address)

@dataclass
class Match:
    match_id: str
    players: List[Tuple[JoinRequest, str]] # [((pk, username), sid)]
    auth: Dict[str, str] = field(default_factory=dict)


# Configure logging + globals
L = log.prepare_log(__name__)
HORIZON_URL = "https://horizon-testnet.stellar.org"
SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org"
NETWORK_PASSPHRASE = sdk.Network.TESTNET_NETWORK_PASSPHRASE
SOURCE_SEED = sdk.Keypair.from_secret("SA2N744UAZOBBGHQP7GGZ56BODFGD5AV4CTK36DTJEOYM3RR2ZBLTGMT")
CONTRACT_ID = "CCXJBV3TWE4UNAF3GGOZVW7CTNAP6SCKQXSYFTO5NP2BG2UD3VSC4IGC"
ONE_XLM = 10_000_000
COST_TO_PLAY = 4 * ONE_XLM # ~$1

BASE_FEE = 100


app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# In-memory queue for connected players, unique for public keys but the dict
# value (request ID) might change on reconnects.
#
# We abuse insertion order preservation to get queue behavior.
player_queue: OrderedDict[JoinRequest, str] = OrderedDict()

# Dictionary to store active match state
active_matches: Dict[str, Match] = {}


@app.route("/")
def index():
    """Basic index endpoint."""
    return "Flask WebSocket Server Running"


@socketio.on("connect")
def on_connect():
    """Handle a new connection."""
    print(player_queue)
    L.info(f"Player established connection: {request.sid}")


@socketio.on("disconnect")
def on_disconnect():
    """Handle disconnection."""
    L.info(f"Player disconnected: {request.sid}")

    # Find the matching player
    for pk, sid in player_queue.items():
        if sid == request.sid:
            player_queue.pop(pk)
            L.info(f"Removed player {pk} from queue.")

    # Additional cleanup for active matches could be handled here.


@socketio.on("join")
def on_join(data):
    L.info(f"Join request: {request.sid}, {data}.")

    if not isinstance(data, dict):
        L.warning("Invalid join request.")
        return

    print(player_queue)

    join = JoinRequest(**data)
    if not join.valid:
        L.warning(f"Invalid data on 'join': {data}")
        return

    existing_sid = player_queue.get(join)
    if existing_sid is not None:
        L.warning(f"Player {data} already in queue.")
        player_queue[join] = request.sid
        return

    L.info(f"Player {join} added to queue.")
    player_queue[join] = request.sid
    _check_queue()

@socketio.on("auth_response")
def on_auth_response(data):
    """ Handle an auth_response from a player.
    """
    match_id, entry, player = map(data.get, (
        "match_id",
        "entry",
        "player"
    ))

    L.info(f"Player {player[:8]}.. authorized match: {entry}")

    # In your auth_response handler:
    match = active_matches.get(match_id)
    if match is None:
        L.error("Match ID %s not found.", match_id)
        emit("match_error", {"error": "Match not found."})
        return

    match.auth[player] = sdk.xdr.SorobanAuthorizationEntry.from_xdr(entry)

    if len(match.auth) == 2:
        L.info(f"Creating on-chain match between players in {match_id}.")

        try:
            success, first_player = invoke_stellar_contract(match)
        except Exception as e:
            L.exception("Error invoking stellar contract: %s", e)
            for (_, sid) in match.players:
                socketio.emit(
                    "match_error",
                    {"match_id": match_id, "error": "Smart contract failed."},
                    room=sid,
                )
            del active_matches[match_id]
            return

        if success:
            usernames = [join.username for (join, sid) in match.players]
            for (_, sid) in match.players:
                socketio.emit(
                    "match_start",
                    {"match_id": match_id, "first_player": first_player, "users": usernames},
                    room=sid,
                )
            L.info(
                "Match %s started. %s goes first.", match_id, first_player
            )
        else:
            for (_, sid) in match.players:
                socketio.emit(
                    "match_error",
                    {"match_id": match_id, "error": "Smart contract failed."},
                    room=sid,
                )
            L.error("Match %s smart contract failed.", match_id)
        del active_matches[match_id]

def _check_queue():
    """
    Check the queue and match players if there are at least two waiting.
    """
    while len(player_queue) >= 2:
        # First, the players have sufficient funds deposited into the
        # contract to play, otherwise simulation will fail and it won't be clear
        # which player caused it.
        (player1, room1) = player_queue.popitem(last=False)
        if not balance_check(player1.address, room1):
            continue

        (player2, room2) = player_queue.popitem(last=False)
        if not balance_check(player2.address, room2):
            player_queue[player1] = room1 # re-insert the first player back in
            player_queue.move_to_end(player1, last=False) # move to front of queue
            continue

        match_id = f"{player1.address}|{player2.address}"
        active_matches[match_id] = Match(match_id=match_id, players=[
            [player1, room1],
            [player2, room2],
        ])

        # Build transaction with a Soroban contract invocation operation
        txn = build_invoke(player1.address, player2.address, auth=None)
        L.info(f"Built engage transaction {txn.to_xdr()}")
        rpc = sdk.SorobanServer(SOROBAN_RPC_URL)

        try:
            resp = rpc.simulate_transaction(txn)
            if resp.error:
                L.warning(f"Simulation failed: {resp.error}")
                socketio.emit(
                    "match_error",
                    {"error": resp.error},
                    room=[room1, room2],
                )

            print(resp.results)
            print(resp.results[0].auth)

        except sdk.exceptions.SorobanRpcErrorResponse as e:
            L.warning(f"Simulation failed: {e}", exc_info=True)
            continue

        # Find the auth entry corresponding to each player and emit the entry to
        # them in its entirety.
        players = { player1.address: room1, player2.address: room2 }
        for raw_entry in resp.results[0].auth:
            entry = sdk.xdr.SorobanAuthorizationEntry.from_xdr(raw_entry)
            if entry.credentials.type != sdk.xdr.SorobanCredentialsType.SOROBAN_CREDENTIALS_ADDRESS:
                continue

            addr = sdk.Address.from_xdr_sc_address(entry.credentials.address.address).address
            if addr not in players:
                L.warning(f"Unknown auth entry {addr}: {raw_entry}")
                continue

            socketio.emit(
                "auth_request",
                { "match_id": match_id, "entry": raw_entry },
                room=players.pop(addr),
            )
        L.info(f"Match {match_id} created between {player1} and {player2}")


def build_invoke(player1: str, player2: str, auth: Optional[List[Any]] = None):
    rpc = sdk.SorobanServer(SOROBAN_RPC_URL)
    src = rpc.load_account(SOURCE_SEED.public_key)
    p1_addr, p2_addr = map(sdk.Address, (player1, player2))

    # Build transaction with a Soroban contract invocation operation
    return (sdk.TransactionBuilder(
        source_account=src,
        network_passphrase=NETWORK_PASSPHRASE,
        base_fee=BASE_FEE,
    ).append_operation(sdk.InvokeHostFunction(
        sdk.xdr.HostFunction(
            sdk.xdr.HostFunctionType.HOST_FUNCTION_TYPE_INVOKE_CONTRACT,
            sdk.xdr.InvokeContractArgs(
                sdk.Address(CONTRACT_ID).to_xdr_sc_address(),
                sdk.scval.to_symbol("engage").sym,
                [
                    p1_addr.to_xdr_sc_val(),
                    p2_addr.to_xdr_sc_val(),
                ]
            )
        ),
        auth=auth
    )).set_timeout(30).build())


def build_balance(player: str):
    rpc = sdk.SorobanServer(SOROBAN_RPC_URL)
    src = rpc.load_account(SOURCE_SEED.public_key)
    addr = sdk.Address(player)

    # Build transaction with a Soroban contract invocation operation
    return (sdk.TransactionBuilder(
        source_account=src,
        network_passphrase=NETWORK_PASSPHRASE,
        base_fee=BASE_FEE,
    ).append_operation(sdk.InvokeHostFunction(
        sdk.xdr.HostFunction(
            sdk.xdr.HostFunctionType.HOST_FUNCTION_TYPE_INVOKE_CONTRACT,
            sdk.xdr.InvokeContractArgs(
                sdk.Address(CONTRACT_ID).to_xdr_sc_address(),
                sdk.scval.to_symbol("balance").sym,
                [ addr.to_xdr_sc_val() ],
            )
        ),
    )).set_timeout(30).build())

def invoke_stellar_contract(match):
    """
    Simulate invoking a smart contract on the Stellar network.

    Replace this function with your actual integration.

    Returns:
        (bool, str): A tuple where the first element indicates success,
                     and the second element is the first player's ID.
    """
    auths = [ match.auth[player.address] for (player, _) in match.players ]
    rpc = sdk.SorobanServer(SOROBAN_RPC_URL)
    txn = build_invoke(*[player.address for (player, _) in match.players], auth=auths)
    try:
        resp = rpc.simulate_transaction(txn)
        if resp.error:
            L.warning(f"Simulation failed: {resp.error}")
            return False, None

        ptxn = rpc.prepare_transaction(txn, resp)
        ptxn.sign(SOURCE_SEED)
        resp = rpc.send_transaction(ptxn)
        L.debug(f"Match transaction submission status: {resp.status}")

        if resp.status != sdk.soroban_rpc.SendTransactionStatus.PENDING:
            L.error("Match transaction failed: "
                f"{' '.join(resp.diagnostic_events_xdr)}")

        getresp = None
        attempts = 0
        while attempts < 5:
            getresp = rpc.get_transaction(resp.hash)
            L.debug(f"Match transaction status: {getresp.status}")
            attempts += 1

            if getresp.status == sdk.soroban_rpc.GetTransactionStatus.NOT_FOUND:
                time.sleep(2)
                continue

            L.info(f"Match txn done: {getresp}.")
            break

        if getresp.status != sdk.soroban_rpc.GetTransactionStatus.SUCCESS:
            L.error(f"Failure :( -- {getresp.result_meta_xdr}")
            return False, None

        meta = sdk.xdr.TransactionMeta.from_xdr(getresp.result_meta_xdr)
        scv = sdk.scval.to_native(meta.v3.soroban_meta.return_value)
        return True, scv.address

    except sdk.exceptions.SorobanRpcErrorResponse as e:
        L.warning(f"Simulation failed: {e}", exc_info=True)
        return False, None

def balance_check(player: str, room: str) -> bool:
    txn = build_balance(player)
    L.info(f"Built balance transaction {txn.to_xdr()}")

    rpc = sdk.SorobanServer(SOROBAN_RPC_URL)
    resp = rpc.simulate_transaction(txn)
    if resp.error:
        socketio.emit("match_error", {
            "error": "Balance check failed.",
            "details": resp.error,
        }, room=room)
        return False

    elif len(resp.results) > 0 and resp.results[0].xdr:
        balance = sdk.scval.from_int128(resp.results[0].xdr)
        if balance < COST_TO_PLAY:
            socketio.emit("match_error", {
                "error": "Insufficient funds, please Deposit more."
            }, room=room)
        return False

    return True

if __name__ == "__main__":
    socketio.run(app, debug=True)
