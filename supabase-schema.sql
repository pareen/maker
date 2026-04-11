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
  cracked_squad BOOLEAN DEFAULT FALSE,
  philosophy TEXT,
  press_links JSONB DEFAULT '[]',
  total_raised BIGINT,
  total_valuation BIGINT,
  total_users BIGINT,
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
  github_repo_id BIGINT,
  featured BOOLEAN DEFAULT FALSE,
  key_metric TEXT,
  funding_raised BIGINT DEFAULT 0,
  valuation BIGINT DEFAULT 0,
  users_reached BIGINT DEFAULT 0,
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
      NEW.raw_user_meta_data->>'user_name',
      NEW.raw_user_meta_data->>'preferred_username',
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

-- Indexes
CREATE INDEX profiles_username_idx ON profiles(username);
CREATE INDEX projects_user_id_idx ON projects(user_id);
CREATE UNIQUE INDEX projects_github_repo_id_idx ON projects(user_id, github_repo_id) WHERE github_repo_id IS NOT NULL;
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

-- Cracked Squad Applications table
CREATE TABLE cracked_squad_applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  biggest_problem TEXT NOT NULL,
  peers_opinion TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cracked_squad_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own applications"
  ON cracked_squad_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own applications"
  ON cracked_squad_applications FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = 'a21214a3-a805-4549-b774-d9d73069c352'::uuid);

CREATE POLICY "Admin can update applications"
  ON cracked_squad_applications FOR UPDATE
  USING (auth.uid() = 'a21214a3-a805-4549-b774-d9d73069c352'::uuid);

CREATE INDEX cracked_squad_applications_user_id_idx ON cracked_squad_applications(user_id);
CREATE INDEX cracked_squad_applications_status_idx ON cracked_squad_applications(status);

CREATE TRIGGER cracked_squad_applications_updated_at
  BEFORE UPDATE ON cracked_squad_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RECRUITER PROFILES & JOB POSTINGS
-- ============================================

-- Recruiter profiles (any user can opt-in as a recruiter)
CREATE TABLE recruiter_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  company_url TEXT,
  role_title TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recruiter_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public recruiter profiles are viewable by everyone"
  ON recruiter_profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own recruiter profile"
  ON recruiter_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recruiter profile"
  ON recruiter_profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recruiter profile"
  ON recruiter_profiles FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX recruiter_profiles_user_id_idx ON recruiter_profiles(user_id);

CREATE TRIGGER recruiter_profiles_updated_at
  BEFORE UPDATE ON recruiter_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Job postings
CREATE TABLE job_postings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  recruiter_id UUID REFERENCES recruiter_profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  project_name TEXT,
  project_description TEXT,
  role_needed TEXT,
  domains TEXT[] DEFAULT '{}',
  location TEXT,
  remote BOOLEAN DEFAULT TRUE,
  compensation TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Open jobs are viewable by everyone, owners see all"
  ON job_postings FOR SELECT
  USING (status = 'open' OR recruiter_id IN (SELECT id FROM recruiter_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Recruiters can insert their own postings"
  ON job_postings FOR INSERT
  WITH CHECK (recruiter_id IN (SELECT id FROM recruiter_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Recruiters can update their own postings"
  ON job_postings FOR UPDATE
  USING (recruiter_id IN (SELECT id FROM recruiter_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Recruiters can delete their own postings"
  ON job_postings FOR DELETE
  USING (recruiter_id IN (SELECT id FROM recruiter_profiles WHERE user_id = auth.uid()));

CREATE INDEX job_postings_recruiter_id_idx ON job_postings(recruiter_id);
CREATE INDEX job_postings_status_idx ON job_postings(status);
CREATE INDEX job_postings_created_at_idx ON job_postings(created_at DESC);

CREATE TRIGGER job_postings_updated_at
  BEFORE UPDATE ON job_postings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Job applications
CREATE TABLE job_applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id UUID REFERENCES job_postings(id) ON DELETE CASCADE NOT NULL,
  applicant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, applicant_id)
);

ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicants see own, recruiters see their job applications"
  ON job_applications FOR SELECT
  USING (
    auth.uid() = applicant_id
    OR job_id IN (
      SELECT jp.id FROM job_postings jp
      JOIN recruiter_profiles rp ON jp.recruiter_id = rp.id
      WHERE rp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own applications"
  ON job_applications FOR INSERT
  WITH CHECK (auth.uid() = applicant_id);

CREATE POLICY "Recruiters can update application status"
  ON job_applications FOR UPDATE
  USING (
    job_id IN (
      SELECT jp.id FROM job_postings jp
      JOIN recruiter_profiles rp ON jp.recruiter_id = rp.id
      WHERE rp.user_id = auth.uid()
    )
  );

CREATE INDEX job_applications_job_id_idx ON job_applications(job_id);
CREATE INDEX job_applications_applicant_id_idx ON job_applications(applicant_id);

CREATE TRIGGER job_applications_updated_at
  BEFORE UPDATE ON job_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
