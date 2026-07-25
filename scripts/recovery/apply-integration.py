from pathlib import Path
import re


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected text missing in {path}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))


replace(
    "app/routes/admin-operations.tsx",
    '  const db = context.get(cloudflareContext).env.DB;\n  const user = await requireSuperAdmin(request, db);',
    '  const env = context.get(cloudflareContext).env;\n  const db = env.DB;\n  const user = await requireSuperAdmin(request, db);',
)
replace(
    "app/routes/admin-operations.tsx",
    '    const changed = await cancelDelivery(db, deliveryId, user.id);',
    '    const changed = await cancelDelivery(env, deliveryId, user.id);',
)

replace(
    "app/routes/admin-iio-detail.tsx",
    'import { distributeIioBudget } from "~/lib/iio-scoring";\nimport {\n  createOrRefreshIioSheet,\n  importIioSheetReviews,\n} from "~/lib/google-sheets.server";',
    'import {\n  deliveryStatus,\n  enqueueReferenceDelivery,\n  processDeliveryOutbox,\n} from "~/lib/delivery-outbox.server";\nimport { distributeIioBudget } from "~/lib/iio-scoring";\nimport { sha256 } from "~/lib/security.server";',
)
route = Path("app/routes/admin-iio-detail.tsx")
text = route.read_text()
pattern = re.compile(
    r'  if \(intent === "google-sheet-import"\) \{.*?\n  if \(intent === "publish" \|\| intent === "close"\) \{',
    re.S,
)
replacement = '''  if (intent === "google-sheet" || intent === "google-sheet-import") {
    const operation = intent === "google-sheet" ? "sync" : "import";
    if (operation === "import" && campaign.finalizedAt)
      return { error: "Finalized campaign decisions cannot be changed." };
    const applicants = await getApplicants(db, campaign.id);
    const revision =
      operation === "sync"
        ? await sha256(
            JSON.stringify({
              campaign: {
                id: campaign.id,
                status: campaign.status,
                finalizedAt: campaign.finalizedAt,
                budgetCents: campaign.budgetCents,
                weights: [
                  campaign.weightFollowers,
                  campaign.weightXScore,
                  campaign.weightSorsaScore,
                ],
              },
              applicants: applicants.map((item) => ({
                id: item.id,
                status: item.status,
                xFollowers: item.xFollowers,
                xScore: item.xScore,
                sorsaScore: item.sorsaScore,
              })),
            }),
          )
        : String(Math.floor(Date.now() / 300_000));
    const messageType =
      operation === "sync" ? "google_sheet_sync" : "google_sheet_import";
    const queued = await enqueueReferenceDelivery(db, {
      channel: "export",
      messageType,
      recipientReference: admin.id,
      idempotencyKey: `export:${messageType}:${campaign.id}:${revision}`,
      payloadReference: `google:${operation}:${campaign.id}:${admin.id}`,
      createdBy: admin.id,
    });
    if (!queued) return { error: "Google export could not be queued." };
    await processDeliveryOutbox(env, { onlyId: queued.id, limit: 1 });
    const result = await deliveryStatus(db, queued.id);
    if (result?.status === "delivered") {
      if (operation === "sync")
        throw redirect(`/admin/iio/${campaign.slug}?sheet=1`);
      return { exportSaved: "Google Sheet decisions imported." };
    }
    return {
      exportQueued: true,
      exportStatus: result?.status ?? "queued",
    };
  }

  if (intent === "publish" || intent === "close") {'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit("Google Sheet action block was not replaced")
text = text.replace(
    '  const money = new Intl.NumberFormat("en-US", {',
    '  const money = new Intl.NumberFormat("en-GB", {',
    1,
)
notice_pattern = re.compile(
    r'        \{typeof actionData\?\.imported === "number" && \(.*?        \)\}\n',
    re.S,
)
notices = '''        {actionData?.exportSaved && (
          <p className="notice success">{actionData.exportSaved}</p>
        )}
        {actionData?.exportQueued && (
          <p className="notice applicant-notice">
            Google export is queued for automatic retry. Current status: {" "}
            {actionData.exportStatus?.replaceAll("_", " ")}.
          </p>
        )}
'''
text, count = notice_pattern.subn(notices, text, count=1)
if count != 1:
    raise SystemExit("Google Sheet result notice was not replaced")
route.write_text(text)

replace(
    "app/routes/dashboard.tsx",
    'import { requireActionRateLimit } from "~/lib/rate-limit.server";',
    'import { requireActionRateLimit } from "~/lib/rate-limit.server";\nimport {\n  markManagedR2ObjectDeleted,\n  registerManagedR2Object,\n} from "~/lib/r2-lifecycle.server";',
)
replace(
    "app/routes/dashboard.tsx",
    '''    await env.MEDIA.put(key, photo.stream(), {
      httpMetadata: {
        contentType: validPhoto.contentType,
        cacheControl: "private, max-age=300",
      },
      customMetadata: { ownerId: user.id, purpose: "profile-photo" },
    });
    try {''',
    '''    await env.MEDIA.put(key, photo.stream(), {
      httpMetadata: {
        contentType: validPhoto.contentType,
        cacheControl: "private, max-age=300",
      },
      customMetadata: { ownerId: user.id, purpose: "profile-photo" },
    });
    await registerManagedR2Object(db, {
      objectKey: key,
      sourceType: "profile_photo",
      sourceId: user.id,
      ownerUserId: user.id,
    });
    try {''',
)
replace(
    "app/routes/dashboard.tsx",
    '''    } catch (error) {
      await env.MEDIA.delete(key);
      throw error;
    }
    if (previous?.avatarKey && previous.avatarKey !== key)
      await env.MEDIA.delete(previous.avatarKey);''',
    '''    } catch (error) {
      await env.MEDIA.delete(key);
      await markManagedR2ObjectDeleted(db, key);
      throw error;
    }
    if (previous?.avatarKey && previous.avatarKey !== key) {
      await env.MEDIA.delete(previous.avatarKey);
      await markManagedR2ObjectDeleted(db, previous.avatarKey);
    }''',
)
replace(
    "app/routes/dashboard.tsx",
    '    if (previous?.avatarKey) await env.MEDIA.delete(previous.avatarKey);',
    '''    if (previous?.avatarKey) {
      await env.MEDIA.delete(previous.avatarKey);
      await markManagedR2ObjectDeleted(db, previous.avatarKey);
    }''',
)

replace(
    "app/routes/project-edit.tsx",
    'import { assertSameOrigin } from "~/lib/security.server";',
    'import {\n  markManagedR2ObjectDeleted,\n  registerManagedR2Object,\n} from "~/lib/r2-lifecycle.server";\nimport { assertSameOrigin } from "~/lib/security.server";',
)
replace(
    "app/routes/project-edit.tsx",
    '''    await env.MEDIA.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "private, no-store",
      },
      customMetadata: {
        ownerId: user.id,
        projectId: current.id,
        purpose: "project-document",
      },
    });
    try {''',
    '''    await env.MEDIA.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "private, no-store",
      },
      customMetadata: {
        ownerId: user.id,
        projectId: current.id,
        purpose: "project-document",
      },
    });
    await registerManagedR2Object(db, {
      objectKey: key,
      sourceType: "project_document",
      sourceId: id,
      ownerUserId: user.id,
    });
    try {''',
)
replace(
    "app/routes/project-edit.tsx",
    '''    } catch (error) {
      await env.MEDIA.delete(key);
      throw error;
    }''',
    '''    } catch (error) {
      await env.MEDIA.delete(key);
      await markManagedR2ObjectDeleted(db, key);
      throw error;
    }''',
)
replace(
    "app/routes/project-edit.tsx",
    '    await env.MEDIA.delete(document.objectKey);',
    '''    await env.MEDIA.delete(document.objectKey);
    await markManagedR2ObjectDeleted(db, document.objectKey);''',
)

lifecycle = Path("app/lib/r2-lifecycle.server.ts")
lifecycle_text = lifecycle.read_text()
lifecycle_text, count = re.subn(
    r'\nasync function runStatements\(statements: D1PreparedStatement\[\]\) \{.*?\n\}\n',
    '\n',
    lifecycle_text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("Unused R2 statement helper was not removed")
lifecycle.write_text(lifecycle_text)
