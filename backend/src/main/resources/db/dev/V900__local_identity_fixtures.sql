-- Isolated local-only fixture identities. None is an application production default.
INSERT INTO member(id,account_id,display_name,direction,cohort) VALUES
 ('00000000-0000-4000-8000-000000000101','local-admin','本地测试管理员','算法',2024),
 ('00000000-0000-4000-8000-000000000102','local-member-a','本地测试成员甲','算法',2025),
 ('00000000-0000-4000-8000-000000000103','local-member-b','本地测试成员乙','深度学习',2026)
 ON CONFLICT (id) DO NOTHING;
INSERT INTO external_identity(member_id,issuer,subject,account_id) VALUES
 ('00000000-0000-4000-8000-000000000101','http://localhost:8081/realms/xju-lab','00000000-0000-4000-8000-000000000101','local-admin'),
 ('00000000-0000-4000-8000-000000000102','http://localhost:8081/realms/xju-lab','00000000-0000-4000-8000-000000000102','local-member-a'),
 ('00000000-0000-4000-8000-000000000103','http://localhost:8081/realms/xju-lab','00000000-0000-4000-8000-000000000103','local-member-b')
 ON CONFLICT (issuer,subject) DO NOTHING;
INSERT INTO role_assignment(member_id,role,source) VALUES ('00000000-0000-4000-8000-000000000101','LAB_ADMIN','local-fixture')
 ON CONFLICT DO NOTHING;
