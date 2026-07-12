# 018 — Open-Source and No-Billing Requirements

**Status:** Approved for implementation

## 1. No application billing

The project must not contain:

- Stripe/payment provider SDKs
- checkout/subscription pages
- internal credits
- usage-based application billing
- premium feature flags tied to payment

Users bring their own OpenAI API credential and may incur charges directly from OpenAI. The UI must state this clearly without presenting it as an application fee.

## 2. Licensing

Use an OSI-approved license selected by the maintainer, recommended MIT or Apache-2.0. Include copyright and third-party notices where required.

## 3. Contributor experience

Repository includes:

- README quick start
- `.env.example`
- Docker Compose commands
- architecture and spec index
- CONTRIBUTING.md
- SECURITY.md
- code of conduct recommended
- issue and pull request templates
- seeded synthetic sample CSVs
- commands for lint, test, typecheck, migration and reset

## 4. Local development

A contributor can start infrastructure without a real OpenAI key. Provider-dependent tests use mocks. A real key is only needed for optional manual end-to-end AI testing and is entered through Settings or local server secret according to documented mode.

## 5. Extensibility

Provider and vector adapters use narrow interfaces. Do not add abstract factories or unused generic complexity merely to claim extensibility. OpenAI remains the only completed provider in MVP.

## 6. Documentation honesty

- Mark implemented versus planned features.
- Do not claim security certifications.
- Document known limitations.
- Do not publish screenshots containing real keys or user data.
