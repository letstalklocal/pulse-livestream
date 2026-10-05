# Admin payout providers and observed fees

Add a provider in **Payout methods**, select it, and import its country/method/fee observations. There is no mandatory deployment secret. Database relationships are provider → country → method → fee observations. Provider names and enabled states remain editable; imports preserve those edits.

For Remitly, the supplied `artifacts/api-server/src/config/remitly-research-20261004.json` remains usable. For another provider, download the template and fill it using actual observations. The source must be `Signed-in <provider display name> website UI`; Remitly keeps `Signed-in Remitly Business website UI`. Source pages must use HTTPS without credentials, ports, query parameters or fragments. These URLs are retained as evidence and are never fetched by the importer.

Example structure below is illustrative only; replace it with observed values before importing. The fee is in integer cents. Comparison amounts are **send amounts**, not total withdrawals including fees.

```json
{
  "observed_date": "2026-10-05",
  "source": "Signed-in Payoneer website UI",
  "source_urls": ["https://www.payoneer.com/"],
  "sender_country": "US",
  "funding_method": "bank_account",
  "comparison_send_amounts_usd": [15],
  "fee_currency": "USD",
  "production_fee_schedule": false,
  "live_requote_required": true,
  "scope": "Replace with the scope of your actual signed-in observations",
  "countries": [
    {
      "country_code": "CO",
      "country": "Colombia",
      "receive_currency": "COP",
      "inspection_status": "verified_methods",
      "notes": "Illustrative format only; independently verify country and method availability",
      "methods": [
        {
          "label": "Replace with the observed method",
          "delivery_estimate": null,
          "fee_cents_at_15_usd_send": null
        }
      ]
    }
  ]
}
```

The null fee intentionally fails validation; enter a genuinely observed integer fee, including zero if confirmed. Add fee keys matching every comparison amount, for example `fee_cents_at_500_usd_send` when the amount list includes 500. Use an optional exact UTC `observed_at` matching `observed_date` for multiple observations in one day.

Non-Remitly `verified_methods` records country/method research only. Remitly retains its existing link-verification statuses and creator exclusions. `manual_only` and `link_available_no_method_modal` remain unverified; `not_in_destination_picker` means unavailable; `quote_error` preserves an unsuccessful quote inspection.

For routine fee changes, expand the country and method, open **Update observed fee**, enter the exact send amount, fee, funding method, observation time, delivery estimate, taxes and source page, then save. Old observations remain in the database. Fee saving does not verify previously unverified methods, silently enable disabled entries or modify an existing withdrawal's approved quote. Brazil tax readiness remains unresolved until independently verified.

Payout data entry and actual provider sending are separate. The existing creator/provider payment workflow remains Remitly-specific; adding another provider's catalog requires its payment integration before it can be selected by creators.
