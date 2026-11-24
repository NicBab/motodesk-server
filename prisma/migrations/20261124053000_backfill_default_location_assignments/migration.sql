BEGIN;

-- Assign existing active employees without location
-- assignments to their organization's default shop.

INSERT INTO "MembershipLocation" (
    "id",
    "organizationId",
    "membershipId",
    "shopLocationId",
    "createdAt"
)
SELECT
    'ml_backfill_' || m."id",
    m."organizationId",
    m."id",
    sl."id",
    CURRENT_TIMESTAMP
FROM "Membership" m
INNER JOIN "Organization" o
    ON o."id" = m."organizationId"
INNER JOIN "User" u
    ON u."id" = m."userId"
INNER JOIN "ShopLocation" sl
    ON sl."organizationId" = m."organizationId"
    AND sl."isDefault" = true
    AND sl."status" = 'ACTIVE'
WHERE m."status" = 'ACTIVE'
    AND m."role" <> 'OWNER'
    AND o."status" = 'ACTIVE'
    AND u."isActive" = true
    AND NOT EXISTS (
        SELECT 1
        FROM "MembershipLocation" ml
        WHERE ml."organizationId" = m."organizationId"
            AND ml."membershipId" = m."id"
    )
ON CONFLICT ("membershipId", "shopLocationId")
DO NOTHING;

COMMIT;