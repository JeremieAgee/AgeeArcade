# 👨‍💼 Admin Analytics Access — Setup & Management Guide

## Overview

Analytics pages are restricted to **admin users only** using Supabase RLS (Row Level Security).

**Who can access analytics?**
- ✅ Users with `app_metadata.role = 'admin'`
- ❌ Regular authenticated users
- ❌ Anonymous users

---

## 🔧 Make Someone an Admin

### Step 1: Go to Supabase Dashboard

1. Open https://supabase.com
2. Select your project
3. Go to **Authentication** → **Users**

### Step 2: Find the User

Search for the user by email address who should be admin.

### Step 3: Edit App Metadata

1. Click on the user
2. Scroll down to **App Metadata**
3. Click **Edit**
4. Add this JSON:
   ```json
   { "role": "admin" }
   ```

### Step 4: Save

Click **Update** to save.

**Result**: User can now access analytics dashboard.

---

## 📋 Multiple Admins

**Add multiple admins the same way** — each user gets their own `app_metadata` entry with `"role": "admin"`.

**Example**:
```
User 1: alice@example.com → { "role": "admin" }
User 2: bob@example.com  → { "role": "admin" }
User 3: carol@example.com → { "role": "admin" }
```

---

## 🔐 What RLS Restricts

### Data Access Levels

| User Type | Insert Analytics | Read Analytics | Insert Leaderboard | Read Leaderboard |
|-----------|------------------|----------------|--------------------|------------------|
| **Anonymous** (not logged in) | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| **Authenticated** (logged in, not admin) | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| **Admin** (logged in + role: admin) | ✅ Yes | ✅ **Yes** | ✅ Yes | ❌ No |

**Key**: Only **admins** can READ analytics. Everyone else can still WRITE data.

---

## ✅ Test Admin Access

### Test 1: Verify User is Admin

In Supabase SQL Editor, run:
```sql
-- This only works if YOU are logged in as admin
SELECT COUNT(*) FROM arcade_visitors;
```

**Expected Result**:
- ✅ If admin: Returns a number (0 or more)
- ❌ If not admin: Error "new row violates row-level security policy"

### Test 2: Check User Metadata

```sql
-- See all users and their metadata
SELECT 
  id,
  email,
  raw_app_meta_data
FROM auth.users
ORDER BY created_at DESC;
```

**Expected**:
- Admin users have `"role":"admin"` in `raw_app_meta_data`
- Regular users have `{}` or other metadata

---

## 🚀 Setup Steps

### Step 1: Apply RLS Policies

```sql
-- Copy entire file and paste into Supabase SQL Editor
-- COMPLETE_SQL_FINAL.sql
```

### Step 2: Make Admin User(s)

1. Go to Supabase Dashboard → Authentication → Users
2. Find your user
3. Edit App Metadata → Add `{ "role": "admin" }`
4. Save

### Step 3: Test Access

1. Sign in to your arcade as that user
2. Visit admin dashboard or run SQL query
3. Verify you can see analytics data

### Step 4: Create Analytics Page (Optional)

Build an admin dashboard page that queries analytics views:
```sql
SELECT * FROM vw_game_stats;
SELECT * FROM vw_daily_visitors;
SELECT * FROM get_top_games(10);
```

---

## 🔑 How It Works (Technical)

### Supabase Auth Flow

```
User signs in
  ↓
Supabase generates JWT token
  ↓
Token includes app_metadata from user's profile
  ↓
When user queries database, RLS checks JWT
  ↓
If app_metadata.role = 'admin' → Allow READ
If not admin → Block READ
```

### RLS Policy Code

```sql
CREATE POLICY admin_read_visitors ON arcade_visitors
FOR SELECT USING (
  (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
);
```

**Breaks down**:
- `auth.jwt()` — Get the JWT token
- `->> 'app_metadata'` — Extract app_metadata field (as TEXT)
- `::jsonb` — Convert to JSON object
- `->> 'role'` — Get the "role" field
- `= 'admin'` — Check if value is "admin"

---

## 🛡️ Security Notes

### What's Protected?
- ✅ Analytics tables (arcade_visitors, arcade_sessions, etc.)
- ✅ Game session data
- ✅ Event history
- ✅ User tracking data

### What's NOT Protected?
- ❌ Leaderboards (publicly readable)
- ❌ Game saves (private to player via localStorage)
- ❌ Authentication itself

### Who Can Still Submit Data?
- ✅ Everyone (anonymous + authenticated + admin)
- ✅ Data collection continues normally
- ✅ Only READ access is restricted

---

## 👤 User Types in Your Arcade

### Anonymous User (No Login)
```
Can do:
✅ Play games
✅ Submit leaderboard scores
✅ Analytics events recorded

Cannot do:
❌ Sign up for leaderboards
❌ View analytics dashboard
```

### Authenticated User (Logged In, Not Admin)
```
Can do:
✅ Play games
✅ Submit leaderboard scores (with display name)
✅ Save game progress
✅ Analytics events recorded
✅ See public leaderboards

Cannot do:
❌ View analytics dashboard
```

### Admin User (Logged In + Role: admin)
```
Can do:
✅ Everything authenticated user can do
✅ View analytics dashboard
✅ Query all analytics data
✅ Export reports
✅ View player behavior

Cannot do:
❌ Delete user accounts (not in scope)
❌ Modify user data (only read via RLS)
```

---

## 📊 Query Analytics as Admin

Once you're admin, you can run these queries:

```sql
-- Total unique visitors
SELECT COUNT(*) FROM arcade_visitors;

-- Daily activity
SELECT * FROM vw_daily_visitors LIMIT 7;

-- Game statistics
SELECT * FROM vw_game_stats;

-- Player retention
SELECT * FROM get_retention_status();

-- Top games
SELECT * FROM get_top_games(10);

-- Custom queries
SELECT game_id, COUNT(*) as plays, COUNT(DISTINCT visitor_id) as players
FROM arcade_game_sessions
WHERE ended_at IS NOT NULL
GROUP BY game_id
ORDER BY plays DESC;
```

---

## 🔄 Change Admin Status

### Remove Admin

1. Go to Supabase Dashboard → Authentication → Users
2. Find user
3. Edit App Metadata → Remove `"role": "admin"`
4. Save

**Result**: User loses analytics access immediately.

### Add Admin

(See "Make Someone an Admin" above)

---

## 🚨 Troubleshooting

### "New row violates row-level security policy"

**Problem**: You tried to query analytics but got RLS error

**Solution**: 
- Check if your user has `"role": "admin"` in App Metadata
- Make sure you're logged in (check JWT token in browser console)
- Wait a few seconds for Supabase to refresh JWT

### "Policy doesn't exist"

**Problem**: COMPLETE_SQL_FINAL.sql wasn't applied

**Solution**:
1. Copy entire COMPLETE_SQL_FINAL.sql
2. Paste into Supabase SQL Editor
3. Click **Run**
4. Check for errors

### Still can't see data

**Problem**: Everything set up but still get access denied

**Solution**:
1. Sign out completely
2. Clear browser cache
3. Sign back in
4. Try query again

---

## 📝 Multiple Admin Workflows

### Scenario 1: One Admin
```
User: you@example.com
Role: admin
Access: Full analytics
```

### Scenario 2: Admin Team
```
User: alice@example.com → admin
User: bob@example.com → admin
User: carol@example.com → admin
Access: All can see full analytics
```

### Scenario 3: Admin + Analyst
```
User: admin@example.com → admin (can do everything)
User: analyst@example.com → admin (can view reports)
User: player@example.com → (regular user, can play)
Access: Admin + Analyst see analytics, Player just plays
```

---

## 🎯 Setting Up Analytics Page

After RLS is restricted to admin only, you can build an admin dashboard:

```html
<!-- admin/analytics.html or similar -->
<script src="../../js/arcade-auth.js"></script>

<div id="analytics">
  <!-- Only shows for logged-in admin users -->
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
  // Check if admin
  if (!window.ArcadeAuth || !ArcadeAuth.isLoggedIn()) {
    document.body.innerHTML = '<h1>Sign in first</h1>';
    return;
  }
  
  const user = ArcadeAuth.getUser();
  const isAdmin = user?.app_metadata?.role === 'admin';
  
  if (!isAdmin) {
    document.body.innerHTML = '<h1>Admin access only</h1>';
    return;
  }
  
  // Load analytics data
  loadAnalytics();
});

async function loadAnalytics() {
  const sb = window._ageeSupabaseClient;
  if (!sb) return;
  
  const { data, error } = await sb.from('arcade_visitors').select('*');
  if (error) {
    console.error('Query failed:', error);
    return;
  }
  
  console.log('Total visitors:', data.length);
  // Render dashboard with data
}
</script>
```

---

## ✅ Admin Checklist

- [ ] COMPLETE_SQL_FINAL.sql applied to database
- [ ] Admin user(s) created in Supabase Auth
- [ ] Admin metadata added: `{ "role": "admin" }`
- [ ] Admin user signed in and tested
- [ ] Admin can query analytics (tested with SQL)
- [ ] Non-admin users still can't read analytics (tested)
- [ ] Data collection still working for everyone (analytics events firing)

---

## 🔒 Security Summary

| Type | Data Visible | Can Query | Can Modify |
|------|--------------|-----------|-----------|
| **Anonymous** | Leaderboards only | Leaderboards | Submit scores |
| **Authenticated** | Leaderboards only | Leaderboards | Submit scores, saves |
| **Admin** | Everything | All tables | Read-only by default |

**Default**: Admin can READ all data, no one can DELETE/UPDATE (except system operations).

---

