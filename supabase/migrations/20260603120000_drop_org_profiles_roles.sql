-- Remove org profile roles (no app logic reads this column)

UPDATE orgs
SET metadata = metadata - 'roles'
WHERE metadata ? 'roles';

ALTER TABLE org_profiles DROP COLUMN roles;
