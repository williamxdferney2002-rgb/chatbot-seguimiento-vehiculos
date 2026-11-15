# Daily operations

## Diego: record activity when it happens

At the start of a route, Diego can name the vehicle and then describe each event. The user catalog remembers the current vehicle; confirmations show the plate. He can send a voice note or a photo/PDF with a caption. If the extraction conflicts with his explicit words, those words prevail.

The following messages and amounts are invented examples; each message may lead to validation or clarification rather than an immediate write.

| Spanish chat example | English translation |
|---|---|
| “TRK101, viaje a Pueblo Alto, sueldo 10 mil” | “TRK101, trip to Pueblo Alto, wage 10 thousand” |
| “Pagué 2 mil de parqueadero, TRK101” | “I paid 2 thousand for parking, TRK101” |
| “Tanqueé TRK101, km 15000, 5 galones, 10 mil, tarjeta, lleno” | “Refueled TRK101, odometer 15000, 5 gallons, 10 thousand, card, full” |
| “Cargué 10 ruedas para flete de Luis Herrera” | “Loaded 10 units for Luis Herrera's freight” |
| “Cargué 5 bultos de abono” | “Loaded 5 sacks of fertilizer” |
| “Luis Herrera pagó 3 mil del flete, recibí yo” | “Luis Herrera paid 3 thousand toward the freight; I received it” |
| “¿Cuánto me deben?” | “How much am I owed?” |

He checks the summary before continuing. If the bot asks who paid, he chooses the correct payer or cancels. If a plate/quantity is wrong, he replies to that bot message with a correction; a reply identifies the record rather than guessing “the latest one.” Repeated taps should produce one accounting operation.

Driver account queries and shared statement PDFs are read-only. A dedicated driver dashboard was proposed but deferred; do not give Diego the admin dashboard or expose fertilizer purchase costs/profit through an improvised shared view.

## Registrars: capture operations without a wage account

Registrars report authorized refuels, freight, loading and fertilizer movements. They name the vehicle when it differs from their remembered context and state who paid or collected when relevant. Recording someone else's activity does not create wages for the registrar or automatically credit Diego.

A registrar's permissions and payer defaults come from `Usuarios`. An unknown or inactive user cannot register. Customer names are kept as supplied when they cannot be safely resolved; ambiguity must not silently move money between people.

## Admin and Mario Ortiz: review the queue

During the day, administrators use the dashboard to review Diego's account, freight/customer payments, fertilizer purchases/sales without prices, vehicle costs, fuel efficiency and linked receipts. They set prices, tariffs and vehicle data, inspect anomalies and apply authorized corrections. Company-card spending remains vehicle cost; it does not increase Diego's reimbursement.

WhatsApp inputs and bot replies are visible in the Telegram administrative group. Telegram is not a bridge for replying to a WhatsApp sender. If a sender is not integrated, the copied message is an item for human review.

## Weekly review

On Sunday at 09:00 Bogotá time, review pending customer balances, oil-change status and vehicle document expiries/missing dates. Diego's WA notice can wait until he next writes if the messaging window is closed. Check health/error notifications separately; a workflow sending a health ping does not prove every business path is healthy.

Compare any suspicious fuel segment with odometer and receipt evidence. When importing fuel history, disable automatic text-to-number/date/formula conversion and compare imported totals before relying on charts.

## Reconcile and close a period

1. Review the open period with Diego; resolve missing prices, payers and receipts.
2. Compare the chat balance and dashboard statement.
3. Generate a preview PDF. Confirm who owes whom.
4. An administrator explicitly closes the period. Preserve its records and opening/ending balance.
5. Check PDF/email/chat delivery status. Retry missing delivery effects without closing again.
6. Record an old-period error as an adjustment in the next open period, with a reason.

Period closing follows business agreement, not a mandatory weekly schedule. [Rules](business-rules.md) and [installation](../apps-script/dashboard/README.md) describe the underlying constraints.
