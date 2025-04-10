// export function humanizeEvents(events: xdr.DiagnosticEvent[]) {
//     return events.map((e) => {
//       // A pseudo-instanceof check for xdr.DiagnosticEvent more reliable
//       // in mixed SDK environments:
//       if (e.inSuccessfulContractCall !== undefined) {
//         return extractEvent(e.event());
//       }

//       // return extractEvent(e);
//     });
//   }

//   function extractEvent(event: xdr.ContractEvent) {
//     return {
//       ...(typeof event.contractId === "function" &&
//         event.contractId() != null && {
//           contractId: StrKey.encodeContract(event.contractId()),
//         }),
//       type: event.type().name,
//       topics: event
//         .body()
//         .value()
//         .topics()
//         .map((t) => scValToNative(t)),
//       data: JSON.stringify(event.body().value().data()),
//     };
//   }
