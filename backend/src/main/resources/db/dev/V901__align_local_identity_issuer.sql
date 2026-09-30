-- Keep the fixed test members linked to the issuer used by this dev deployment.
INSERT INTO external_identity(member_id, issuer, subject, account_id) VALUES
 ('00000000-0000-4000-8000-000000000101','${oidcissuer}','00000000-0000-4000-8000-000000000101','local-admin'),
 ('00000000-0000-4000-8000-000000000102','${oidcissuer}','00000000-0000-4000-8000-000000000102','local-member-a'),
 ('00000000-0000-4000-8000-000000000103','${oidcissuer}','00000000-0000-4000-8000-000000000103','local-member-b')
 ON CONFLICT (issuer, subject) DO UPDATE SET
   member_id = EXCLUDED.member_id,
   account_id = EXCLUDED.account_id,
   active = true;
