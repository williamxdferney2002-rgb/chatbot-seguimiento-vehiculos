# Glossary

The operators work in Spanish. Runtime text, parsing regex, identifiers, n8n node names, sheet tabs and headers remain Spanish deliberately. English documentation explains these contracts without renaming them. Code comments and development instructions are English.

| Spanish term / field | English meaning | Context |
|---|---|---|
| `cuadre` | Driver account reconciliation | Who owes whom at a point in time |
| `corte`, `Cortes` | Settlement period / period closing | Immutable statement and carry-forward balance |
| `saldo anterior` | Opening / carried balance | Last closed balance or initial configuration |
| `Ganado` | Earned | Driver wages and qualifying earnings |
| `Adelantado` | Advanced out of pocket | Company expense paid by Diego |
| `Recibido` | Received | Money held/received by Diego that reduces his balance |
| `Descuento` | Deduction | Insurance share or explicit adjustment |
| `abono` | Fertilizer **or** payment installment | Resolve from context; `Inventario abono` means fertilizer |
| `bulto` | Sack | Fertilizer quantity |
| `cargue` / `descargue` | Loading / unloading | Distinct earnings and operational events |
| `transbordo` | Transshipment | Does not imply unloading earnings |
| `rueda` | Local load unit | Product quantity in loading/freight; not automatically a literal vehicle wheel |
| `flete` | Freight / haulage charge | Customer charge or internal vehicle income |
| `Cobros` | Charges / receivables | Not synonymous with payments received |
| `Pagos clientes` | Customer payments | Linked partial/full collections |
| `Pagó` / `Cobró` / `Recibió` | Paid / collected / received | Different roles in the money movement |
| `consignación` | Bank deposit / transfer | May be driver-account receipt, depending on intent |
| `tanqueo` | Refuel | Odometer, gallons, cost and full/partial flag |
| `ACPM` | Diesel fuel | Colombian operational term |
| `placa` / `carro` | License plate / vehicle | Catalog identity and colloquial name |
| `turbo` | Local nickname for a truck | Vehicle aliases, not a separate accounting class |
| `comprobante` / `soporte` | Receipt / supporting document | Photo/PDF linked to a record |
| `SOAT` | Mandatory traffic accident insurance | Vehicle document and expiry |
| `técnico-mecánica` | Technical / roadworthiness inspection | Vehicle document and expiry |
| `PEPS` | FIFO | First-in, first-out fertilizer costing |
| `Por confirmar` | Pending confirmation | Persisted operation and reply context |
| `candado` | Lock | Serialize a write or claim a callback |
| `sello` | Execution-based stamp | Timestamp plus execution identity |
| `anulado` | Voided | Preserved record excluded from active totals |
| `Log` / `Cambios` | Execution log / change audit | Input/result versus before/after history |
| `Paga como` | Default payer identity | User configuration |
| `éxito` | Delivery-related earnings concept | Configured operational term, not generic “success” |

The pseudonyms Diego, Admin, Mario Ortiz and Luis Herrera, and the vehicle labels TRK101, TRK202 and VAN303, are retained as fictional examples. Additional privacy substitutions are documented in the [validation report](validation-report.md).
