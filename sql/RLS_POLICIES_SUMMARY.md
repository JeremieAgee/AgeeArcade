# 🔐 RLS Policies Summary

## Analytics Read Access: Admin Only

`COMPLETE_SQL_FINAL.sql` restricts analytics reads to admins only:

```sql
-- Only admins can read analytics
CREATE POLICY admin_read_visitors ON arcade_visitors FOR SELECT USING (
  (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
);
```

**Who can read analytics?**
- ✅ Only users with `app_metadata.role = 'admin'`
- ❌ Regular authenticated users
- ❌ Anonymous users

Anyone (including anonymous visitors) can still INSERT analytics events — this only restricts reading the data back out.

---

## 📊 RLS Policies by Table

### arcade_visitors
| Policy | Type | For | Allows |
|--------|------|-----|--------|
| anon_insert_visitors | INSERT | Anonymous | Anyone insert |
| admin_read_visitors | SELECT | Admin only | Only admins read |

### arcade_sessions
| Policy | Type | For | Allows |
|--------|------|-----|--------|
| anon_insert_sessions | INSERT | Anonymous | Anyone insert |
| anon_update_sessions | UPDATE | Anonymous | Anyone heartbeat update |
| admin_read_sessions | SELECT | Admin only | Only admins read |

### arcade_page_views
| Policy | Type | For | Allows |
|--------|------|-----|--------|
| anon_insert_page_views | INSERT | Anonymous | Anyone insert |
| admin_read_page_views | SELECT | Admin only | Only admins read |

### arcade_game_sessions
| Policy | Type | For | Allows |
|--------|------|-----|--------|
| anon_insert_game_sessions | INSERT | Anonymous | Anyone insert |
| anon_update_game_sessions | UPDATE | Anonymous | Anyone update (game end) |
| admin_read_game_sessions | SELECT | Admin only | Only admins read |

### arcade_events
| Policy | Type | For | Allows |
|--------|------|-----|--------|
| anon_insert_events | INSERT | Anonymous | Anyone insert |
| admin_read_events | SELECT | Admin only | Only admins read |

---

## 🔑 How Admin Status Works

### User Becomes Admin

1. **Supabase Dashboard** → Authentication → Users
2. **Find user** → Click on email
3. **App Metadata** → Edit
4. **Add JSON**:
   ```json
   { "role": "admin" }
   ```
5. **Save**

### RLS Checks Admin Status

When user queries analytics, Supabase:
1. Gets user's JWT token
2. Extracts `app_metadata` field
3. Checks if `role` = `"admin"`
4. Allows read if true, blocks if false

### Code Check

```sql
-- This is what RLS checks:
(auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'

-- In English:
-- 1. Get the JWT token
-- 2. Get app_metadata field as text
-- 3. Parse as JSON
-- 4. Get "role" field
-- 5. Is it equal to "admin"?
```

---

## ✅ Verify Admin Access

### Test 1: Check User Metadata

```sql
SELECT email, raw_app_meta_data 
FROM auth.users 
WHERE email = 'admin@example.com';
```

**Expected**:
```
email              | raw_app_meta_data
admin@example.com  | {"role":"admin"}
```

### Test 2: Query as Admin

If signed in as admin:
```sql
SELECT COUNT(*) FROM arcade_visitors;
```

**Expected**: Returns a number (0 or more)

### Test 3: Try as Non-Admin

If signed in as non-admin:
```sql
SELECT COUNT(*) FROM arcade_visitors;
```

**Expected**: 
```
ERROR: new row violates row-level security policy "admin_read_visitors" on table "arcade_visitors"
```

---

## 🚀 Setup Checklist

### Initial Setup (One Time)
- [ ] Run `COMPLETE_SQL_FINAL.sql` (creates admin-only RLS policies)

### Add Admin User
- [ ] Go to Supabase → Auth → Users
- [ ] Find user email
- [ ] Edit App Metadata
- [ ] Add `{ "role": "admin" }`
- [ ] Save
- [ ] User signs out/in to refresh JWT

### Test
- [ ] Admin signs in
- [ ] Admin queries analytics
- [ ] Non-admin signs in
- [ ] Non-admin tries query (should be blocked)

---

## 🔒 Security Details

### Anonymous User
```
No JWT token
↓
Cannot read any tables (all have auth checks)
↓
Can only submit data (anon insert policies)
```

### Authenticated User (Not Admin)
```
Has JWT token
↓
auth.role() = 'authenticated' passes
↓
But app_metadata.role ≠ 'admin'
↓
admin_read policy blocks
```

### Admin User
```
Has JWT token
↓
auth.role() = 'authenticated' passes
↓
And app_metadata.role = 'admin'
↓
admin_read policy allows
```

---

## 📁 Files Related to RLS

| File | Purpose |
|------|---------|
| `COMPLETE_SQL_FINAL.sql` | Creates tables with admin-only RLS |
| `ADMIN_SETUP_GUIDE.md` | How to make users admin |
| `RLS_POLICIES_SUMMARY.md` | This file |

---

## Quick Commands

### Make User Admin
```sql
-- Direct SQL method (alternative to UI):
UPDATE auth.users 
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'::jsonb
)
WHERE email = 'user@example.com';
```

### Check All Admins
```sql
SELECT email, raw_app_meta_data 
FROM auth.users 
WHERE raw_app_meta_data::jsonb ->> 'role' = 'admin'
ORDER BY created_at DESC;
```

### Remove Admin
```sql
UPDATE auth.users 
SET raw_app_meta_data = raw_app_meta_data - 'role'
WHERE email = 'user@example.com';
```

---

## 🎯 Summary

Only admins can see analytics:
- ✅ More secure
- ✅ Professional
- ⚠️ Requires admin setup (see above)

**File to use**: `COMPLETE_SQL_FINAL.sql`

---

