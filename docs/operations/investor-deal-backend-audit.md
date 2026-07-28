# Investor Deal Discovery backend audit

This review confirms the production architecture and the intended connections between the Investor profile and the Deal Rooms catalogue.

## Existing server-backed flows

- Investor preferences are stored in `investor_profiles`.
- Investor role verification is stored in `role_verifications` and synchronised with `investor_profiles`.
- Published catalogue records come from `opportunity_listings` joined to published `projects`.
- Saved and passed states are stored in `opportunity_user_states`.
- Private-room requests and approvals are stored in `data_room_requests`.
- Confidential document access is enforced through `document_access_grants`.
- Questions, introductions, interests, updates and audit events are persisted separately.

## Gap corrected by this release

The previous “Recommended” ordering did not consume the saved Investor preference record. This release connects sectors, stages, geographies and currency-aware ticket range to deterministic catalogue matching, adds live menu counts, and exposes profile readiness directly inside the Investor House.

Matching is discovery support only. It does not rank expected returns, assess suitability or provide investment advice.
