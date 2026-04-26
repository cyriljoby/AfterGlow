# CLAUDE.md — Bloom

A group photo album app: AI-ranked photos, person-tagged montages, World ID bot resistance.

---

## Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Mobile | Expo managed workflow (SDK 51) | No custom native modules needed; EAS Build → TestFlight in one command |
| Language | TypeScript everywhere | App + backend share types from `packages/types` |
| Navigation | React Navigation v6 (native-stack + bottom-tabs) | |
| State | Zustand | Minimal boilerplate |
| Local persistence | expo-secure-store (tokens), AsyncStorage (upload queue) | |
| Backend | Express on Vercel serverless (`/api` directory) | |
| Database | Supabase (Postgres + Realtime) | |
| Auth | World ID 4.0 → JWT in SecureStore | |
| Media | Cloudinary direct upload from device | |
| Face recognition | AWS Rekognition, one collection per album | |
| Image delivery | Cloudinary transform URLs via expo-image | |
| Video playback | expo-av `Video` component | |

---

## Monorepo structure

```
bloom/
├── apps/
│   └── mobile/                  # Expo managed app
│       ├── app.json
│       ├── App.tsx              # Root: NavigationContainer + auth gate
│       ├── src/
│       │   ├── screens/
│       │   │   ├── auth/
│       │   │   │   ├── WelcomeScreen.tsx
│       │   │   │   ├── VerifyScreen.tsx       # World ID handoff
│       │   │   │   └── HandleScreen.tsx       # Pick username
│       │   │   ├── album/
│       │   │   │   ├── HomeScreen.tsx         # User's albums list
│       │   │   │   ├── AlbumScreen.tsx        # Ranked photo grid
│       │   │   │   ├── PhotoScreen.tsx        # Fullscreen + face overlays
│       │   │   │   ├── PeopleScreen.tsx       # Person cards + clusters
│       │   │   │   └── MontageScreen.tsx      # Generate + play montage
│       │   │   ├── explore/
│       │   │   │   └── ExploreScreen.tsx
│       │   │   └── profile/
│       │   │       └── ProfileScreen.tsx
│       │   ├── components/
│       │   │   ├── PhotoGrid.tsx              # FlatList grid, lazy load
│       │   │   ├── PhotoThumbnail.tsx         # Cloudinary URL + score badge
│       │   │   ├── FaceOverlay.tsx            # SVG bboxes over fullscreen photo
│       │   │   ├── PersonCard.tsx
│       │   │   ├── UploadTray.tsx             # Sticky bottom progress
│       │   │   └── MontageChip.tsx
│       │   ├── navigation/
│       │   │   ├── RootNavigator.tsx          # Auth vs Main switch
│       │   │   ├── MainTabNavigator.tsx       # Home / Explore / Profile tabs
│       │   │   └── linking.ts                 # Deep link config
│       │   ├── hooks/
│       │   │   ├── useAuth.ts
│       │   │   ├── useWorldID.ts
│       │   │   ├── useUpload.ts               # Cloudinary upload queue
│       │   │   └── useAlbumRealtime.ts        # Supabase Realtime
│       │   ├── services/
│       │   │   ├── api.ts                     # Axios + JWT interceptor
│       │   │   ├── cloudinary.ts              # Direct upload helpers
│       │   │   └── supabase.ts                # Supabase JS client
│       │   ├── store/
│       │   │   ├── authStore.ts
│       │   │   └── uploadStore.ts
│       │   └── utils/
│       │       └── cloudinaryUrl.ts           # Build transform URLs
│       └── eas.json
│
├── api/                         # Vercel serverless functions
│   ├── auth/
│   │   └── verify.ts            # POST /api/auth/verify
│   ├── albums/
│   │   ├── index.ts             # GET (list), POST (create)
│   │   └── [id]/
│   │       ├── index.ts         # GET, PATCH, DELETE
│   │       ├── join.ts          # POST /api/albums/:id/join
│   │       ├── photos.ts        # GET /api/albums/:id/photos
│   │       ├── people.ts        # GET /api/albums/:id/people
│   │       └── montages.ts      # POST /api/albums/:id/montages
│   ├── people/
│   │   ├── enroll.ts            # POST /api/people/enroll (selfie)
│   │   └── [id]/
│   │       └── index.ts         # PATCH (rename), DELETE (revoke)
│   └── webhooks/
│       └── cloudinary.ts        # POST /api/webhooks/cloudinary
│
├── packages/
│   └── types/
│       └── index.ts             # Shared TS types (Album, Photo, Person…)
│
├── supabase/
│   └── schema.sql
│
├── vercel.json
└── package.json                 # Turborepo / pnpm workspace root
```

---

## Environment variables

### Mobile (`apps/mobile/.env`)
```
EXPO_PUBLIC_SUPABASE_URL=https://YOURPROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=yourcloud
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=bloom_unsigned
EXPO_PUBLIC_WORLD_ID_APP_ID=app_staging_xxxxxxxxxxxxxxxx
EXPO_PUBLIC_WORLD_ID_ACTION=bloom-signup
EXPO_PUBLIC_API_URL=https://bloom-api.vercel.app
```

### Backend (`api/.env` / Vercel dashboard)
```
WORLD_ID_RP_ID=app_staging_xxxxxxxxxxxxxxxx
JWT_SECRET=min-32-char-random-string
JWT_EXPIRES_IN=30d
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_URL=https://YOURPROJECT.supabase.co
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_WEBHOOK_SECRET=...
REKOGNITION_MAX_OPS_PER_ALBUM_PER_HOUR=200
```

---

## Database schema

Run this in Supabase SQL editor.

```sql
-- Users: World ID nullifier is the key, no PII
create table users (
  id uuid primary key default gen_random_uuid(),
  nullifier_hash text unique not null,
  handle text unique not null check (char_length(handle) between 3 and 20),
  created_at timestamptz default now()
);

-- Albums
create type album_visibility as enum ('private', 'public');
create table albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users not null,
  name text not null,
  description text,
  visibility album_visibility default 'private',
  join_code char(6) unique not null,
  hidden_from_explore boolean default false,
  rekognition_collection_id text,
  created_at timestamptz default now()
);

-- Membership
create type member_role as enum ('owner', 'contributor');
create table album_members (
  album_id uuid references albums on delete cascade,
  user_id uuid references users on delete cascade,
  role member_role default 'contributor',
  joined_at timestamptz default now(),
  primary key (album_id, user_id)
);

-- Photos (metadata only; media lives in Cloudinary)
create table photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid references albums on delete cascade not null,
  uploader_id uuid references users not null,
  cloudinary_public_id text not null,
  width int,
  height int,
  phash text,
  score_quality numeric(5,2) default 0,
  score_content numeric(5,2) default 0,
  score_dup_penalty numeric(5,2) default 0,
  score_composite numeric(5,2) generated always as (
    score_quality * 0.6 + score_content * 0.3 - score_dup_penalty * 0.1
  ) stored,
  tags text[] default '{}',
  face_count int default 0,
  gps_lat numeric(9,6),
  gps_lng numeric(9,6),
  place_name text,
  created_at timestamptz default now()
);
create index photos_album_composite on photos (album_id, score_composite desc);

-- People (one row per identified person per album)
create table people (
  id uuid primary key default gen_random_uuid(),
  album_id uuid references albums on delete cascade not null,
  user_id uuid references users,          -- null for cluster-named people
  display_name text not null,
  is_self boolean default false,
  named_by uuid references users,
  rekognition_face_id text,
  enrollment_image_public_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Face detections on individual photos
create table photo_faces (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references photos on delete cascade not null,
  person_id uuid references people,       -- set when identified
  cluster_id uuid,                        -- set when unidentified
  bbox_x numeric(6,4) not null,           -- 0..1 fractional
  bbox_y numeric(6,4) not null,
  bbox_w numeric(6,4) not null,
  bbox_h numeric(6,4) not null,
  confidence numeric(5,2),
  rekognition_face_id text
);
create index photo_faces_person on photo_faces (person_id);

-- Unidentified face clusters
create table face_clusters (
  id uuid primary key default gen_random_uuid(),
  album_id uuid references albums on delete cascade not null,
  centroid_face_id text,
  face_count int default 1,
  created_at timestamptz default now()
);

-- Generated montages (cached by theme)
create type montage_theme_type as enum ('person', 'tag', 'location', 'face_count');
create table montages (
  id uuid primary key default gen_random_uuid(),
  album_id uuid references albums on delete cascade not null,
  theme_type montage_theme_type not null,
  theme_value text not null,
  photo_ids uuid[] not null,
  collage_url text,
  video_url text,
  created_at timestamptz default now(),
  unique (album_id, theme_type, theme_value)
);
```

---

## Auth flow (World ID → JWT)

This is the most complex flow. Implement it first and don't mock it out.

### How it works

```
App                          Backend                      World ID
 |                              |                              |
 |-- GET /api/auth/init ------> |                              |
 |<- { rp_id, action, signal } -|                              |
 |                              |                              |
 |-- open World App via URL --> |                              |
 |   worldapp://worldid?...     |                              |
 |                              |            [user verifies]   |
 |<-- deep link back to app ---|------------------------------|
 |   bloom://auth?proof=...     |                              |
 |                              |                              |
 |-- POST /api/auth/verify ---> |                              |
 |   { proof, nullifier, ... }  |-- verify proof ------------> |
 |                              |<- { success: true } ---------|
 |                              |                              |
 |                              |-- upsert user row            |
 |<-- { token, user } ---------|                              |
 |                              |                              |
 |-- store token in SecureStore |                              |
```

### Backend: `api/auth/verify.ts`

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { proof, nullifier_hash, merkle_root, verification_level, action, signal } = req.body;

  // 1. Verify proof with World ID
  const verifyRes = await fetch(
    `https://developer.world.org/api/v4/verify/${process.env.WORLD_ID_RP_ID}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proof, nullifier_hash, merkle_root, verification_level, action, signal }),
    }
  );

  if (!verifyRes.ok) {
    const err = await verifyRes.json();
    return res.status(400).json({ error: 'World ID verification failed', detail: err });
  }

  // 2. Upsert user (nullifier_hash is the stable unique key)
  const { data: user, error } = await supabase
    .from('users')
    .upsert({ nullifier_hash }, { onConflict: 'nullifier_hash' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // 3. Issue JWT
  const token = jwt.sign(
    { sub: user.id, handle: user.handle },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '30d' }
  );

  // 4. If no handle yet, tell the app to prompt for one
  return res.status(200).json({
    token,
    user,
    needs_handle: !user.handle,
  });
}
```

### Backend: `api/auth/handle.ts`

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_middleware/requireAuth';
import { supabase } from '../_lib/supabase';

export default requireAuth(async (req, res, userId) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { handle } = req.body;
  if (!handle || !/^[a-zA-Z0-9_]{3,20}$/.test(handle)) {
    return res.status(400).json({ error: 'Handle must be 3–20 alphanumeric characters or underscores' });
  }

  const { data, error } = await supabase
    .from('users')
    .update({ handle })
    .eq('id', userId)
    .select()
    .single();

  if (error?.code === '23505') return res.status(409).json({ error: 'Handle already taken' });
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ user: data });
});
```

### Mobile: `src/hooks/useWorldID.ts`

```typescript
import { useState, useCallback } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';

export function useWorldID() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setAuth } = useAuthStore();

  const verify = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Build the World App URL.
      // IDKit handles this on web; on native we construct it manually
      // and use the universal link return flow.
      const redirectUri = Linking.createURL('auth/callback');

      const params = new URLSearchParams({
        app_id: process.env.EXPO_PUBLIC_WORLD_ID_APP_ID!,
        action: process.env.EXPO_PUBLIC_WORLD_ID_ACTION!,
        signal: '',              // optional: bind to a user signal
        redirect_uri: redirectUri,
        return_to: redirectUri,
      });

      const worldAppUrl = `https://worldcoin.org/verify?${params}`;

      // Open World App (or App Store if not installed)
      const result = await WebBrowser.openAuthSessionAsync(worldAppUrl, redirectUri);

      if (result.type !== 'success') {
        throw new Error('World ID verification cancelled');
      }

      // Parse the proof from the callback URL
      const parsed = Linking.parse(result.url);
      const proof = parsed.queryParams?.proof as string;
      const nullifier_hash = parsed.queryParams?.nullifier_hash as string;
      const merkle_root = parsed.queryParams?.merkle_root as string;
      const verification_level = parsed.queryParams?.verification_level as string;

      if (!proof) throw new Error('No proof returned from World App');

      // Exchange proof for JWT
      const { data } = await api.post('/auth/verify', {
        proof,
        nullifier_hash,
        merkle_root,
        verification_level,
        action: process.env.EXPO_PUBLIC_WORLD_ID_ACTION!,
        signal: '',
      });

      await setAuth(data.token, data.user);

      return { needsHandle: data.needs_handle };
    } catch (err: any) {
      setError(err.message ?? 'Verification failed');
      return { needsHandle: false };
    } finally {
      setLoading(false);
    }
  }, []);

  return { verify, loading, error };
}
```

### Mobile: `src/store/authStore.ts`

```typescript
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { User } from '@bloom/types';

const TOKEN_KEY = 'bloom_jwt';
const USER_KEY = 'bloom_user';

interface AuthStore {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  setAuth: (token: string, user: User) => Promise<void>;
  clearAuth: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  hydrated: false,

  setAuth: async (token, user) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ token: null, user: null });
  },

  hydrate: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const userRaw = await SecureStore.getItemAsync(USER_KEY);
    const user = userRaw ? JSON.parse(userRaw) : null;
    set({ token, user, hydrated: true });
  },
}));
```

### Mobile: `src/navigation/RootNavigator.tsx`

```typescript
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { linking } from './linking';

// Auth screens
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import VerifyScreen from '../screens/auth/VerifyScreen';
import HandleScreen from '../screens/auth/HandleScreen';

// Main app
import MainTabNavigator from './MainTabNavigator';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, token, hydrated, hydrate } = useAuthStore();

  useEffect(() => { hydrate(); }, []);

  if (!hydrated) return null; // splash screen handles this

  const isAuthed = !!token && !!user;
  const needsHandle = isAuthed && !user?.handle;

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthed ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Verify" component={VerifyScreen} />
          </>
        ) : needsHandle ? (
          <Stack.Screen name="Handle" component={HandleScreen} />
        ) : (
          <Stack.Screen name="Main" component={MainTabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

### Mobile: `src/navigation/linking.ts`

```typescript
import type { LinkingOptions } from '@react-navigation/native';

export const linking: LinkingOptions<any> = {
  prefixes: ['bloom://', 'https://bloom.app'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: {
            screens: {
              Album: 'a/:joinCode',   // bloom://a/ABC123 → open album
            },
          },
        },
      },
      // World ID returns here after verification
      'auth/callback': 'auth/callback',
    },
  },
};
```

### Mobile: `src/screens/auth/WelcomeScreen.tsx`

```typescript
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function WelcomeScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🌸 Bloom</Text>
      <Text style={styles.tagline}>
        Group albums that curate themselves.
      </Text>
      <Pressable
        style={styles.cta}
        onPress={() => navigation.navigate('Verify')}
      >
        <Text style={styles.ctaText}>Get started</Text>
      </Pressable>
      <Text style={styles.note}>
        Verification via World ID — no email or password required.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  logo: { fontSize: 40, marginBottom: 12 },
  tagline: { fontSize: 20, textAlign: 'center', marginBottom: 48, color: '#333' },
  cta: { backgroundColor: '#1a1a1a', paddingVertical: 16, paddingHorizontal: 48, borderRadius: 12 },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  note: { marginTop: 24, fontSize: 13, color: '#888', textAlign: 'center' },
});
```

### Mobile: `src/screens/auth/VerifyScreen.tsx`

```typescript
import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useWorldID } from '../../hooks/useWorldID';

export default function VerifyScreen() {
  const navigation = useNavigation<any>();
  const { verify, loading, error } = useWorldID();

  const handleVerify = async () => {
    const { needsHandle } = await verify();
    if (needsHandle) {
      navigation.navigate('Handle');
    }
    // If needsHandle is false and auth succeeded, RootNavigator
    // will automatically switch to the Main stack.
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify you're human</Text>
      <Text style={styles.body}>
        Bloom uses World ID to keep public albums free of bots.
        Your identity is never stored — only a one-time proof.
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleVerify} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Verify with World ID</Text>
        }
      </Pressable>

      <Text style={styles.note}>
        You'll be redirected to the World App to complete verification.
        If the World App isn't installed, you'll be prompted to download it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 32 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 16 },
  body: { fontSize: 15, color: '#555', lineHeight: 22, marginBottom: 40 },
  error: { color: '#c0392b', marginBottom: 16, fontSize: 14 },
  button: { backgroundColor: '#1a1a1a', padding: 18, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  note: { marginTop: 24, fontSize: 12, color: '#999', textAlign: 'center', lineHeight: 18 },
});
```

### Mobile: `src/screens/auth/HandleScreen.tsx`

```typescript
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

export default function HandleScreen() {
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setAuth, token, user } = useAuthStore();

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/auth/handle', { handle });
      // Update stored user with handle
      await setAuth(token!, data.user);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pick a handle</Text>
      <Text style={styles.body}>This is how you'll appear to others in shared albums.</Text>

      <TextInput
        style={styles.input}
        placeholder="e.g. sunsetlover"
        value={handle}
        onChangeText={setHandle}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, !handle && styles.buttonDisabled]}
        onPress={submit}
        disabled={!handle || loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Continue</Text>
        }
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 32 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 12 },
  body: { fontSize: 15, color: '#555', marginBottom: 32 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 14, fontSize: 17, marginBottom: 12,
  },
  error: { color: '#c0392b', marginBottom: 12, fontSize: 14 },
  button: { backgroundColor: '#1a1a1a', padding: 18, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

---

## API client (`src/services/api.ts`)

```typescript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL + '/api',
  timeout: 15000,
});

// Attach JWT to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('bloom_jwt');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global 401 handler: clear auth and redirect to Welcome
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await SecureStore.deleteItemAsync('bloom_jwt');
      await SecureStore.deleteItemAsync('bloom_user');
      // Zustand store will re-read on next hydrate; NavigationContainer handles redirect
    }
    return Promise.reject(err);
  }
);
```

## Backend auth middleware (`api/_middleware/requireAuth.ts`)

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';

type Handler = (req: VercelRequest, res: VercelResponse, userId: string) => Promise<void>;

export function requireAuth(handler: Handler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });

    try {
      const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { sub: string };
      return handler(req, res, payload.sub);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}
```

---

## Vercel config (`vercel.json`)

```json
{
  "rewrites": [{ "source": "/api/:path*", "destination": "/api/:path*" }],
  "functions": {
    "api/**/*.ts": { "maxDuration": 60 }
  }
}
```

> **Vercel timeout note:** Rekognition `IndexFaces` + `SearchFacesByImage` can run 3–8s each.
> The Cloudinary webhook handler must respond 200 immediately and do heavy work async.
> Pattern: respond 200, then `await` the Rekognition calls. Vercel will keep the function alive
> until the async work completes as long as you `await` before returning — but don't exceed 60s.
> For the hackathon this is fine. Post-hackathon: move to a queue (Inngest, Trigger.dev).

---

## Cloudinary setup checklist

1. Create an upload preset named `bloom_unsigned` → unsigned, with:
   - Quality Analysis: **on**
   - Google Auto-Tagging: **on** (confidence threshold 0.6)
   - Face Detection: **on**
   - EXIF extraction: **on**
   - Eager transformations: `w_400,c_fill,g_auto,q_auto,f_auto` (thumbnail) and `w_1600,q_auto,f_auto` (full)
2. Set notification URL → `https://your-vercel-url.vercel.app/api/webhooks/cloudinary`
3. Note your `API Secret` for webhook signature verification

---

## AWS Rekognition setup checklist

1. Create an IAM user with `AmazonRekognitionFullAccess`
2. Note `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
3. Collections are created at runtime per album — no manual setup needed
4. Default region: `us-east-1` (lowest Rekognition latency for US demos)

---

## World ID setup checklist

1. Go to `developer.worldcoin.org` → create an app
2. Add action: `bloom-signup` (one-time use, max 1 verification per user)
3. Note the App ID (`app_staging_…` for staging)
4. In your Vercel env, set `WORLD_ID_RP_ID` to that App ID
5. Universal link domain (`bloom.app`) must match the `redirect_uri` sent to World App

---

## Implementation order (36-hour hackathon)

| Hours | Task | Cut if short on time |
|---|---|---|
| 0–2 | Monorepo init, Expo project, Vercel project, Supabase schema, env vars wired | — |
| 2–6 | World ID auth end-to-end (VerifyScreen → backend → JWT → HandleScreen → Main) | Mock verify: skip World App handoff, POST fake nullifier directly |
| 6–12 | Album create/join, photo upload (expo-image-picker → Cloudinary direct), webhook → DB row, basic grid | Drop duplicate-penalty scoring |
| 12–18 | Composite scoring, ranked grid, sort toggles, fullscreen pager | Skip sort toggles |
| 18–24 | Face bboxes on fullscreen photo, self-enrollment flow, auto-tag on upload | Ship enrollment UI only; skip cluster-and-name |
| 24–30 | People screen, filtered photo grid per person, montage generation | Static collage only; skip video |
| 30–34 | Explore page, polish, deep link join flow | Hard-code 3 seed albums |
| 34–36 | Demo script, fallback screen recordings, TestFlight build | — |

---

## Key implementation notes

**Face bounding boxes** — Cloudinary returns absolute pixel coords; normalize to 0..1 before storing. In `FaceOverlay.tsx`, use a `<View style={{ position: 'absolute', left: bbox_x * imgW, top: bbox_y * imgH, width: bbox_w * imgW, height: bbox_h * imgH }}/>` overlaid on the photo with `react-native-svg` or a simple `View` with a border.

**Supabase Realtime** — subscribe to `photos` table changes filtered by `album_id`. On INSERT, prepend to the local photo list. On UPDATE (score computed), replace the row. Unsubscribe on unmount.

**Upload queue** — store pending uploads in Zustand + AsyncStorage. Each job has `{ id, albumId, localUri, status, progress }`. Retry on app relaunch by reading the queue from AsyncStorage in the app root.

**Cloudinary URL builder** — always use `f_auto,q_auto` plus an explicit width. Never load originals in the grid. Example: `https://res.cloudinary.com/${cloud}/image/upload/w_400,c_fill,q_auto,f_auto/${publicId}`.

**Person privacy** — on the Explore page, never show `photo_faces.person_id` or `people.display_name` to non-members. The API must enforce this: join `album_members` and return 403 for people/faces endpoints if the requester isn't a member.
