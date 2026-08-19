# R90 destructive cleanup gate

R90 does **not** drop historical CRM-era House tables automatically.

The following evidence is required before a later destructive migration may be merged:

- both production D1 databases backed up;
- House legacy inventory completed;
- CRM AKARI tenant inventory completed;
- all active NDA-dependent House projects explicitly mapped;
- relevant House members explicitly mapped to CRM contacts where appropriate;
- read-only `CRM_API_KEY` configured for House;
- `CRM_NDA_BRIDGE_MODE=shadow` run in production long enough to cover active diligence;
- all authorization-affecting mismatches resolved;
- `CRM_NDA_BRIDGE_MODE=crm` enabled and production diligence tests passed;
- CRM outage/failure confirmed to fail closed;
- code search proves no registered House runtime path reads frozen CRM tables;
- final House D1 backup checksum recorded privately;
- rollback plan reviewed.

Only after this gate is complete should a separate release remove legacy CRM-era House tables.
