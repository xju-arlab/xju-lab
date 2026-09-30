-- Isolated CI-only data for the documented 100-member capacity smoke test.
-- These rows have no external identity and cannot be used to sign in.
INSERT INTO member (account_id, display_name, direction, cohort)
SELECT 'e2e-capacity-' || n, 'CI容量样本成员-' || lpad(n::text, 3, '0'), '算法', 2026
FROM generate_series(1, 97) AS members(n)
ON CONFLICT (account_id) DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM member WHERE account_id LIKE 'e2e-capacity-%') <> 97 THEN
    RAISE EXCEPTION 'Expected 97 isolated CI capacity members';
  END IF;
END
$$;
