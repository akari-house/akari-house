from pathlib import Path

path = Path("app/routes/deals.tsx")
value = path.read_text()
old_probe = '    await db.prepare("SELECT 1 FROM opportunity_listings LIMIT 1").first();'
new_probe = '''    await db
      .prepare(
        `SELECT ol.project_id, ol.status, ol.reviewed_at, ol.closing_at,
                ol.sector, ol.geography, ol.funding_instrument,
                ol.raise_minimum, ol.raise_maximum, ol.raise_currency,
                ol.minimum_participation, ol.public_summary, ol.updated_at,
                ous.saved_at, ous.passed_at,
                drr.status AS requestStatus, drr.expires_at
         FROM opportunity_listings ol
         LEFT JOIN opportunity_user_states ous
           ON ous.project_id = ol.project_id
         LEFT JOIN data_room_requests drr
           ON drr.project_id = ol.project_id
         LIMIT 1`,
      )
      .first();'''
if value.count(old_probe) < 1:
    raise SystemExit("Deals schema probe insertion point was not found.")
value = value.replace(old_probe, new_probe, 1)
value = value.replace(
    "                pr.seeking, p.display_name AS founderName,\n",
    "                pr.seeking,\n"
    "                COALESCE(p.display_name, 'AKARI Founder') AS founderName,\n",
    1,
)
value = value.replace(
    "         JOIN profiles p ON p.user_id = pr.founder_user_id\n"
    "         WHERE pr.status = 'published'\n",
    "         LEFT JOIN profiles p ON p.user_id = pr.founder_user_id\n"
    "         WHERE pr.status = 'published'\n",
    1,
)
old_fallback_start = '''    const projects = await db
      .prepare('''
if value.count(old_fallback_start) < 1:
    raise SystemExit("Deals public fallback insertion point was not found.")
value = value.replace(old_fallback_start, '''    try {
      const projects = await db
        .prepare(''', 1)
old_fallback_end = '''      options: { sectors: [], geographies: [], instruments: [] },
    };
  }

  const conditions ='''
new_fallback_end = '''      options: { sectors: [], geographies: [], instruments: [] },
    };
    } catch (fallbackError) {
      console.error("Deals public project fallback query failed.", fallbackError);
      return {
        user,
        verifiedInvestor: false,
        opportunities: [] as OpportunityRow[],
        view,
        filters: { sector, stage, geography, instrument },
        options: { sectors: [], geographies: [], instruments: [] },
      };
    }
  }

  const conditions ='''
if old_fallback_end not in value:
    raise SystemExit("Deals public fallback closing point was not found.")
value = value.replace(old_fallback_end, new_fallback_end, 1)
path.write_text(value)
