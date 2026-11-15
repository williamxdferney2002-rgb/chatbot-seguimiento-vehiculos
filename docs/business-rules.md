# Business rules

All numerical examples below are invented units, not operational balances or tariffs. Rules reflect later decisions and supplied code where the initial plan changed.

## Driver reconciliation (cuadre)

```text
closing balance = opening balance
                + earned
                + expenses advanced by Diego
                - money received by Diego
                - discounts
```

A positive balance means the company owes Diego; a negative one means Diego owes the company. Count active records in the open period. The opening balance comes from the last closed period, or the configured initial balance if no period exists.

Example, in illustrative units only: opening 100 + earned 40 + advanced 20 − received 30 − discounts 5 = 125 owed to the driver.

| Record class | Meaning | Effect on driver account |
|---|---|---|
| `Ganado` | Trip wage, qualifying loading/unloading, delivery earnings and configured driver earnings | Adds |
| `Adelantado` | Operational expense paid by Diego | Adds only when the payer is Diego |
| `Recibido` | Cash, transfers or other money received against his account | Subtracts |
| `Descuento` | Insurance share and explicit adjustments/discounts | Subtracts |

A registrar has no driver wage account. Recording an expense does not automatically mean its author paid it.

## Who paid

Supported payer identities include `Diego`, `Mario Ortiz` and `Tarjeta Mario Ortiz`. Mario/card expenses affect vehicle cost without increasing the company's debt to Diego.

Resolve explicit card wording and named payers first, then the user's `Paga como` / `Pregunta quién pagó` configuration. If unresolved, ask with buttons. Specific operation defaults override general inference: refuels default to the company card and a full tank unless the message says otherwise; a new SOAT defaults to Mario unless another payer is explicit. Receipt expenses have their own sender/default rules. The LLM cannot choose a payer merely from recent conversation.

The user's current text prevails over a conflicting AI extraction. A wage-payment statement is received against Diego's account even if the receipt names someone else; it is not automatically a customer collection.

## Trips, loading and freight

- A trip records route and wage; missing wage requires clarification.
- Loading earnings use quantity × applicable product tariff without rounding away fractional quantities. Helpers are paid separately by Diego.
- Only unloading actually performed by Diego earns unloading pay; transshipped units do not.
- Explicit prices override configured tariffs for that operation. Later configured earnings include daily delivery earnings and other income; do not assume the earliest per-delivery rule is the only rule.
- A loading record with an explicit freight customer creates the linked freight charge. Internal company freight is income for the vehicle, without an external customer debt.
- Loading lists use deterministic parsing and confirmation. Compare a submitted list with existing records first; an explicit replacement voids and replaces only the relevant day's vehicle records. A quantity correction updates the linked loading and freight together.
- An incurred freight charge and a payment are separate facts. Ask who collected only when the message says a payment happened.

## Fertilizer (abono)

Here `abono` can mean fertilizer, not merely a payment. Loading fertilizer increases inventory on a vehicle; unloading to a customer creates a sale. Later rules removed automatic driver per-sack loading/unloading earnings for fertilizer. Buying it is a company expense paid by Mario, not his card.

Admins enter missing purchase/sale prices in the dashboard; a price explicitly supplied by Diego is marked as such. A sale without a price is pending pricing, not a numeric debt. Cost uses FIFO (`PEPS`) purchase lots; profit is company revenue, not driver earnings. The intended commercial model earns the transport margin through the purchase/sale difference rather than an extra fertilizer freight charge.

## Customer debt and collections

`Cobros` stores freight/sale charges; `Pagos clientes` stores linked payments, method, receiver and receipt. Status distinguishes unpriced, pending, partial, paid and internal charges.

Money collected by Diego is read directly from those sources for the reconciliation; **do not copy it to Movimientos**, which would subtract it twice. A collection received by Mario does not reduce Diego's balance. Match a payment to the relevant charge and prevent overpayment or ambiguous assignment.

## Fuel and vehicle costs

The bot's full-to-full refuel analysis uses distance since the previous full tank divided by accumulated gallons, including partial refuels; segment fuel cost uses the same distance. Later dashboard fuel views use consecutive refuel pairs at most six days apart, retain plausible segments of 8–30 km/gallon, and summarize monthly efficiency with their median. Do not assume the two presentations use identical aggregation. Monthly costs include relevant fuel and maintenance plus configured allocations and consolidated views. Historical fuel imports are read-only and deduplicated against bot refuels by vehicle/odometer.

Oil reminders use the vehicle's last-change odometer and interval. Sunday notices include customer debts, oil status and document expiries/missing dates.

## Periods (cortes) and corrections

Admins generate a statement at any time and explicitly close a period. Closing freezes its membership, records totals and carries the ending balance into the next period. A PDF, email and chat notification are delivery effects; failure to deliver does not reopen a successfully closed period. Retry only missing effects.

Late corrections to closed periods become adjustments in the next open period. Current-period corrections act on identified records; void rather than delete and write `Cambios`. Undo/correction must reverse all linked effects. The current core also supports configured monthly insurance discounts with a month-specific identity so retries do not duplicate them.

See [data model](data-model.md) for the Spanish field contract and [daily operations](daily-operations.md) for examples.
