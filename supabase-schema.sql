-- Supabase Schema for Maker Portfolio
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT,
  bio TEXT,
  first_make_description TEXT,
  first_make_age TEXT,
  domains TEXT[] DEFAULT '{}',
  today_making TEXT,
  socials JSONB DEFAULT '{"twitter": "", "github": "", "linkedin": "", "substack": "", "website": ""}',
  embed_feed JSONB DEFAULT '{"type": null, "url": ""}',
  show_email BOOLEAN DEFAULT FALSE,
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects table
CREATE TABLE projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  one_liner TEXT,
  role TEXT DEFAULT 'solo',
  current_stage TEXT DEFAULT 'idea',
  start_date DATE,
  end_date DATE,
  ongoing BOOLEAN DEFAULT true,
  domains TEXT[] DEFAULT '{}',
  links TEXT[] DEFAULT '{}',
  outcome TEXT,
  description TEXT,
  image_url TEXT,
  featured BOOLEAN DEFAULT FALSE,
  key_metric TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Projects policies
CREATE POLICY "Public projects are viewable by everyone"
  ON projects FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- Function to handle new user signup
-- Uses COALESCE to handle OAuth users who don't have 'username' in metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1),
      'user_' || LEFT(NEW.id::text, 8)
    )
  );
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  -- Username collision: append random suffix
  INSERT INTO profiles (id, username)
  VALUES (NEW.id, split_part(NEW.email, '@', 1) || '_' || LEFT(md5(random()::text), 4));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Updates table (timeline / social feed of maker updates)
CREATE TABLE updates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public updates are viewable by everyone"
  ON updates FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own updates"
  ON updates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own updates"
  ON updates FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster username lookups
CREATE INDEX profiles_username_idx ON profiles(username);
CREATE INDEX projects_user_id_idx ON projects(user_id);
CREATE INDEX updates_user_id_idx ON updates(user_id);
CREATE INDEX updates_created_at_idx ON updates(created_at DESC);

-- Error logs table (for client-side error tracking)
CREATE TABLE error_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  error_message TEXT,
  error_code TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can insert error logs (even if auth is broken)
CREATE POLICY "Anyone can insert error logs"
  ON error_logs FOR INSERT
  WITH CHECK (true);

-- Only admin users can read error logs
CREATE POLICY "Admin can read error logs"
  ON error_logs FOR SELECT
  USING (auth.uid() = 'a21214a3-a805-4549-b774-d9d73069c352'::uuid);

CREATE INDEX error_logs_created_at_idx ON error_logs(created_at DESC);
CREATE INDEX error_logs_user_id_idx ON error_logs(user_id);

-- Migration: Add contact fields to profiles (run if upgrading existing database)
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_email BOOLEAN DEFAULT FALSE;
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Migration: Add description field to projects (run if upgrading existing database)
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;

-- Migration: Add image_url, featured, key_metric fields to projects
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url TEXT;
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS key_metric TEXT;
