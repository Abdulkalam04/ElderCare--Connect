# ElderCare Connect 🏥👴👵

> A comprehensive platform empowering adult children to remotely manage and monitor elderly parents' health with AI-powered intelligence, real-time emergency response, and compassionate support.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with React](https://img.shields.io/badge/Built%20with-React%2019-blue.svg)](https://react.dev)
[![Powered by Supabase](https://img.shields.io/badge/Powered%20by-Supabase-green.svg)](https://supabase.com)
[![AI by Google Gemini](https://img.shields.io/badge/AI%20by-Google%20Gemini-red.svg)](https://ai.google.dev)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Problems Solved](#key-problems-solved)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

**ElderCare Connect** is a full-stack web application designed to bridge the gap between adult children and their elderly parents through modern technology. It provides comprehensive health monitoring, emergency response, medication management, and AI-powered companionship—all in one elderly-friendly platform.

The application addresses the unique challenges of modern elder care, combining accessibility for elderly users with powerful monitoring tools for their caregivers.

### Key Problems Solved

✅ **Remote Health Monitoring** - Track parents' health from anywhere in the world  
✅ **Medication Adherence** - Automated, multi-modal reminders with voice support  
✅ **Emergency Response** - One-click SOS with live location sharing  
✅ **Social Isolation** - AI companion providing emotional support and practical assistance  
✅ **Service Coordination** - Book and track professional care services seamlessly  
✅ **Health Risk Detection** - AI-powered early warning system for critical situations

### Target Users

- 👨‍👩‍👧‍👦 **Adult children** living abroad monitoring parents at home
- 👴👵 **Elderly parents** needing medication reminders and health tracking
- 👨‍⚕️ **Healthcare providers** accessing detailed patient records
- 🚑 **Care coordinators** managing multiple clients
- 🏥 **Family members** responding to emergency situations

---

## ✨ Features

### 1. **Health Dashboard** 🏥

Complete health management system for comprehensive elderly care.

- **📋 Medical Records** - Upload, organize, and access health documents (PDFs, images)
- **🏥 Doctor Appointments** - Schedule and track medical appointments with automated reminders
- **💊 Medicine Schedules** - Set medication times with dosage tracking and daily completion logs
- **📊 Health Reports** - Visualize vital signs trends (BP, blood sugar, heart rate, weight, SpO2, temperature)
- **🚶 Activity Tracking** - Monitor daily activities and wellness metrics

### 2. **Emergency SOS System** 🚨

Life-saving one-tap emergency alert system with real-time family notification.

- **⚡ One-Click Alert** - Large SOS button for emergency situations
- **📍 Live Location Sharing** - Automatic GPS capture with address reverse-geocoding
- **📢 Family Notifications** - Instant push & email alerts to all linked family members
- **👨‍⚕️ Caregiver Alerts** - Nearby caregivers notified in real-time
- **📝 Alert History** - Track all SOS events with timestamps and resolutions
- **⚡ Real-time Updates** - WebSocket-based live status streaming

### 3. **Smart Medicine Reminder** 💊

Multi-modal reminder system ensuring 100% medication adherence.

- **🔊 Voice Reminders** - Browser-based voice announcements at scheduled times
- **📲 Push Notifications** - Mobile alerts on configured devices
- **🤖 Missed Dose Detection** - AI alerts parents when doses are missed
- **✅ Daily Tracking** - Simple checkbox to mark medicines as taken
- **⏱️ Duration Tracking** - Track how long each medicine should be taken
- **📋 Dosage Management** - Detailed dosage and frequency configuration

### 4. **Professional Caregiver Booking** 👨‍⚕️

Professional care service booking system with real-time status tracking.

**Services Available:**

- 🏥 Nurse (certified medical care)
- 🧘 Physiotherapist (mobility & recovery)
- 👥 Companion (social support)
- 🏠 Caretaker (daily living assistance)

**Features:**

- Book services for specific dates and times
- Assign caregivers to bookings
- Track booking status in real-time
- View complete booking history

### 5. **Transport Assistance** 🚗

Medical transportation booking for hospital visits and appointments.

- **🚕 Trip Types** - One-way or round-trip options
- **📍 Flexible Routing** - Hospitals, clinics, emergency travel
- **🗺️ Real-time Tracking** - Live status updates from booking to completion
- **♿ Accessibility** - Special assistance notes for wheelchair access or special needs
- **👨‍🚗 Driver Assignment** - Automatic driver allocation when confirmed
- **📌 Pickup Location** - Geolocation-based or custom address selection

### 6. **Daily Wellbeing Check** ✅

Simple, engaging daily check-in system designed for elderly users.

**Health Questions:**

- 🍽️ Did you eat today?
- 💊 Did you take medicine?
- 😊 Are you feeling okay?
- ⚡ How is your energy level?
- 💧 Did you drink water?

**Features:**

- Quick yes/no questions for easy completion
- Emotional check-in tracking
- 14-day history visualization
- Real-time status updates to children
- AI alerts if check-in missed (24+ hours)

### 7. **Video Consultation** 📹

Telemedicine integration for remote doctor consultations.

- **📅 Schedule Consultations** - Book with specific doctor
- **🔗 Meeting Links** - Store Zoom, Google Meet, or other video URLs
- **📋 Prescription Management** - Upload prescriptions post-consultation
- **📊 Consultation Tracking** - Complete history with notes and outcomes
- **📍 Status Management** - Track consultation flow from scheduled to completed

### 8. **AI Health Risk Predictor** 🤖🔮

Machine learning model predicting health risk based on comprehensive vital signs.

**Input Parameters:**

- Age, Blood Pressure (Systolic/Diastolic)
- Blood Sugar Level, Heart Rate
- Activity Level, Weight, Oxygen Level
- Optional wellness notes

**Output:**

- 🎯 **Risk Level**: Low, Medium, or High
- 📊 **Risk Score**: 0-100 numeric rating
- 💬 **AI Summary**: Contextualized health assessment
- 💡 **Recommendations**: Actionable health advice
- 📈 **Assessment History**: Track predictions over time

**How it Works:**

1. Clinical thresholds evaluate vital signs (deterministic)
2. Google Gemini AI provides personalized context
3. Risk level locked to prevent AI manipulation
4. Fallback recommendations if API fails

### 9. **Intelligent Emergency Detection** 🚨🤖

Automatic system detecting critical situations requiring immediate intervention.

**Detects:**

- **Missed Medicines** - Doses not taken by scheduled time → Medium severity
- **Missed Wellbeing Check** - No check-in for 24+ hours → High severity
- **No ElderCare App Activity** - No activity heartbeat within the configured threshold → High severity

**Features:**

- Automatic detection (no user action needed)
- Cooldown periods prevent alert spam (6-24 hours)
- Parent/Child notification system
- Alert history with detailed logs
- Grace period for new users (first 24 hours)

### 10. **AI Companion Chatbot** 🤖💬

Warm, supportive AI friend providing emotional support and practical assistance.

**Capabilities:**

- **💊 Medicine Reminders** - Gentle reminders about taking medicines, drinking water, eating
- **❓ Question Answering** - Basic health and lifestyle questions
- **💕 Companionship** - Warm conversation for emotional support
- **📎 Private Attachments** - Stores user-selected chat attachments privately; local care answers do not require them to be sent to an AI provider
- **🆘 Safety First** - Redirects to SOS or doctor for medical emergencies

**Features:**

- Text-based chat interface
- Free browser voice input and read-aloud through the Web Speech API
- File/image attachment support
- Chat history with date-based grouping
- Retry mechanism (3 attempts with exponential backoff)
- Elderly-friendly interaction style

---

## 🛠 Tech Stack

### Frontend

| Technology               | Purpose                              |
| ------------------------ | ------------------------------------ |
| **React 19**             | Modern UI library                    |
| **TypeScript 5.9**       | Type safety and developer experience |
| **TanStack Router**      | Client-side routing and navigation   |
| **TanStack React Query** | Server state management              |
| **TailwindCSS 4.2**      | Utility-first styling                |
| **Radix UI**             | Accessible component library         |
| **Recharts**             | Data visualization and charts        |
| **Zod**                  | Runtime type validation              |
| **React Hook Form**      | Efficient form management            |
| **Sonner**               | Toast notifications                  |

### Backend

| Technology         | Purpose                    |
| ------------------ | -------------------------- |
| **TanStack Start** | Full-stack React framework |
| **Node.js/Deno**   | Runtime environment        |
| **Nitro**          | Server engine              |
| **Vite 8**         | Build tool and dev server  |

### Database & Authentication

| Technology            | Purpose                             |
| --------------------- | ----------------------------------- |
| **Supabase**          | PostgreSQL database hosting         |
| **Supabase Auth**     | User authentication & authorization |
| **Supabase Realtime** | WebSocket subscriptions             |
| **Supabase Storage**  | File storage and management         |

### AI & ML

| Technology       | Purpose                          |
| ---------------- | -------------------------------- |
| **Google GenAI** | Gemini 2.5 Flash for AI features |

### Browser APIs

| API                 | Purpose            |
| ------------------- | ------------------ |
| **Web Push API**    | Push notifications |
| **Web Speech API**  | Voice reminders    |
| **Geolocation API** | Location capture   |
| **Service Workers** | Offline capability |

---

## 🚀 Quick Start

### 1. **Clone & Install (5 minutes)**

```bash
git clone https://github.com/yourusername/eldercare-connect.git
cd eldercare-connect
npm install
```

### 2. **Configure Environment (10 minutes)**

```bash
cp env.example .env
# Edit .env with your Supabase & Google Gemini keys
```

### 3. **Setup Database (2 minutes)**

```bash
supabase db push
```

### 4. **Start Development (1 minute)**

```bash
npm run dev
```

Visit: **http://localhost:5173**

---

## 📥 Installation

### Prerequisites

- **Node.js** 18+ and npm/yarn/pnpm
- **Supabase Account** (free tier available at supabase.com)
- **Google Cloud Account** (for Gemini API)
- **Git**

### Step-by-Step Installation

#### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/eldercare-connect.git
cd eldercare-connect
```

#### 2. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

#### 3. Environment Configuration

Create `.env` file in root directory:

```env
# ============ SUPABASE ============
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# ============ GOOGLE GEMINI ============
GEMINI_API_KEY=your_gemini_api_key_here

# ============ APP CONFIG ============
VITE_APP_NAME=ElderCare Connect
VITE_APP_URL=http://localhost:5173
```

#### 4. Database Setup

**Option A: Automatic (Recommended)**

```bash
supabase link --project-ref your-project-id
supabase db push
```

**Option B: Manual**

- Run every file in `supabase/migrations/` in chronological filename order.
- Do not use a separate master or repair SQL script; the migration history is the only supported schema source.

#### 5. Storage Buckets

The migrations create and secure the private `health-records`, `prescriptions`, and avatar buckets. Do not create public replacements manually.

#### 6. Start Development Server

```bash
npm run dev
```

Server runs at: **http://localhost:5173**

### First Login

1. Create account with email/password
2. Assign role: **Parent** (elderly) or **Child** (caregiver)
3. Add family members and link accounts
4. Start monitoring health!

---

## 📁 Project Structure

```
eldercare-connect/
├── src/
│   ├── components/          # Reusable React components
│   │   ├── dashboard/       # Health dashboard components
│   │   ├── emergency/       # SOS alert components
│   │   ├── medicine/        # Medicine reminder components
│   │   └── shared/          # Shared UI components
│   ├── hooks/               # Custom React hooks
│   ├── integrations/        # Supabase auth, database and Storage clients
│   ├── lib/                 # Utility functions
│   ├── routes/              # TanStack Router pages
│   │   ├── parent/          # Elderly parent routes
│   │   ├── child/           # Adult child routes
│   │   └── shared/          # Shared routes
│   ├── server.ts            # Backend server
│   ├── router.tsx           # Route configuration
│   └── styles.css           # Global styles
├── supabase/
│   ├── migrations/          # Database migrations
│   ├── functions/           # Edge functions
│   ├── README.md            # Migration and deployment rules
│   └── config.toml          # Supabase config
├── public/                  # Static assets
├── package.json             # Dependencies
├── vite.config.ts          # Build configuration
└── tsconfig.json           # TypeScript config
```

---

## 🗄️ Database Schema

### User Management Tables

**profiles**

- User identification (user_id, email)
- Role and profile information
- Preferences and settings

**family_relations**

- Links between parents and children
- Relationship tracking

### Health Data Tables

**medicines**

- Medicine details (name, dosage, frequency)
- Schedule timing and duration
- User history and tracking

**medicine_logs**

- Daily medicine intake records
- Timestamps and status tracking

**vital_signs**

- Blood pressure, heart rate, blood sugar
- Temperature, weight, oxygen level
- Abnormality flags

**health_records**

- File metadata (title, category, record_date)
- Storage integration with Supabase

**health_risk_assessments**

- Vital signs inputs, risk_level, risk_score
- AI-generated summary and recommendations

### Service Tables

**caregiver_bookings**

- Service type (nurse, physiotherapist, companion, caretaker)
- Status tracking and caregiver assignment
- Date, time, duration, and notes

**transport_bookings**

- Trip type (one_way | round_trip)
- Pickup location and destination
- Driver assignment and real-time updates

**appointments**

- Doctor name and specialty
- Location and status
- Reminder settings

**video_consultations**

- Doctor information and reason
- Meeting URL and status
- Completion tracking

**prescriptions**

- Post-consultation prescription files

### Emergency & Notification Tables

**sos_alerts**

- Location (latitude, longitude, address)
- Status (active, acknowledged, resolved)
- Timestamps and responder information

**care_alerts**

- Type (missed wellbeing, missed medicine, no app activity, health risk, companion safety)
- Active, acknowledged and resolved lifecycle
- Severity, evidence metadata and deduplication keys

**push_subscriptions**

- Device endpoints for push notifications
- Subscription metadata

**companion_messages**

- Chat history with role and timestamp
- Message content and attachments

---

## ⚙️ Configuration

### Environment Variables Reference

```env
# SUPABASE - Database & Auth
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# GOOGLE GEMINI - AI Features
GEMINI_API_KEY=your_gemini_api_key_here

# APP CONFIGURATION
VITE_APP_NAME=ElderCare Connect
VITE_APP_URL=http://localhost:5173
VITE_APP_ENV=development
```

### Supabase Setup Guide

#### Create Project

1. Visit [supabase.com](https://supabase.com)
2. Click "New Project"
3. Enter project name and database password
4. Copy URL and API keys to `.env`

#### Configure Authentication

```sql
-- In Supabase SQL Editor
-- Creates auth policies automatically via migrations
```

#### Enable RLS (Row-Level Security)

- Policies are auto-created by migrations
- Each user sees only their own data
- Verify in Supabase dashboard

#### Create Storage Buckets

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('health-records', 'health-records', false);

INSERT INTO storage.buckets (id, name, public)
VALUES ('prescriptions', 'prescriptions', false);
```

### Google Gemini Setup

1. **Go to** [Google Cloud Console](https://console.cloud.google.com)
2. **Create Project** or select existing
3. **Enable API**:
   - Search "Generative AI API"
   - Click "Enable"
4. **Create API Key**:
   - Go to "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy key to `.env` as `GEMINI_API_KEY`

---

## 📦 Deployment

### Deploy to Vercel (Recommended)

#### Prerequisites

- GitHub account with repository
- Vercel account (free tier available)

#### Steps

1. **Push to GitHub**

   ```bash
   git remote add origin https://github.com/yourusername/eldercare-connect.git
   git branch -M main
   git push -u origin main
   ```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Select your GitHub repository
   - Add environment variables from `.env`
   - Click "Deploy"

3. **Configure Supabase CORS**
   - Log in to Supabase
   - Project Settings → API
   - Add your Vercel URL to "Allowed origins"

4. **Update URLs**
   - Set `VITE_APP_URL` to your Vercel domain
   - Redeploy if changed

### Deploy to Other Platforms

#### Netlify

```bash
npm run build
# Upload 'dist' folder to Netlify
```

#### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

EXPOSE 3000
ENV NODE_ENV=production

CMD ["npm", "start"]
```

Then push to Docker Hub or your container registry.

#### Heroku (Deprecated)

Consider Vercel or Netlify instead for better performance.

---

## 🐛 Troubleshooting

### Supabase Connection Issues

**Error: "Supabase connection failed"**

```bash
# Verify environment variables
cat .env | grep SUPABASE

# Check Supabase project status
# Visit your Supabase dashboard
```

**Solution:**

- Ensure `VITE_SUPABASE_URL` includes full URL
- Verify anon key is public (ok to expose)
- Check service role key is private (never expose)
- Ensure CORS is configured for your domain

### Geolocation Not Working

**Symptoms:** SOS location not capturing

**Solutions:**

- App must use HTTPS (except localhost)
- Check browser permissions for location
- Some regions block geolocation APIs
- Test in Chrome DevTools (Device → Geolocation)

### Push Notifications Not Received

**Symptoms:** No notifications on device

**Solutions:**

- Verify Service Worker: `chrome://serviceworker-internals`
- Check notification permissions in browser settings
- Ensure HTTPS connection (required)
- Test notification API in console: `Notification.permission`

### Voice Reminders Not Working

**Symptoms:** No audio from reminders

**Solutions:**

- Browser must support Web Speech API
- Chrome and Edge support it; Safari partial support
- Check browser console for errors
- Ensure volume is not muted
- Some browsers require HTTPS

### Google Gemini API Errors

**Error: "API key not valid"**

```bash
# Verify API key
echo $GEMINI_API_KEY

# Check Google Cloud console
# Ensure Generative AI API is enabled
```

**Error: Rate limit exceeded**

- Upgrade Google Cloud project
- Check quotas in console
- Implement request caching

### Build or Start Errors

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf .vite

# Try build
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

---

## 🤝 Contributing

We welcome contributions! ElderCare Connect is built by the community, for the community.

### How to Contribute

1. **Fork the Repository**

   ```bash
   # Click "Fork" on GitHub
   # Clone your fork
   git clone https://github.com/yourusername/eldercare-connect.git
   ```

2. **Create Feature Branch**

   ```bash
   git checkout -b feature/your-amazing-feature
   ```

3. **Make Changes**
   - Follow existing code style
   - Add TypeScript types
   - Test thoroughly before pushing
   - Update documentation if needed

4. **Commit with Clear Messages**

   ```bash
   # Use conventional commits
   git commit -m "feat: add amazing feature"
   git commit -m "fix: resolve bug in component"
   git commit -m "docs: update README section"
   ```

5. **Push & Create Pull Request**
   ```bash
   git push origin feature/your-amazing-feature
   # Open PR on GitHub with description
   ```

### Development Guidelines

- **Code Style**: Follow existing patterns and conventions
- **TypeScript**: Always use types; avoid `any`
- **Components**: Keep them small and focused
- **Testing**: Test before pushing
- **Accessibility**: Ensure elderly-friendly interaction
- **Documentation**: Update README for new features
- **Performance**: Minimize bundle size
- **Elderly-UX**: Remember our users' needs

### Areas Needing Help

- 🌐 Internationalization (i18n) - Multiple languages
- 📱 Mobile app (React Native)
- 🧪 Test coverage
- ♿ Accessibility improvements
- 📚 Documentation
- 🎨 UI/UX enhancements

---

## 📚 Additional Resources

### Documentation

- **[Supabase Docs](https://supabase.com/docs)** - Database & authentication
- **[React Documentation](https://react.dev)** - UI library
- **[TanStack Router](https://tanstack.com/router)** - Routing
- **[TailwindCSS Docs](https://tailwindcss.com)** - Styling
- **[Radix UI](https://radix-ui.com)** - Component library

### AI & APIs

- **[Google GenAI Docs](https://ai.google.dev)** - Gemini AI

### Learning Resources

- **Web APIs**: [MDN Web Docs](https://developer.mozilla.org)
- **TypeScript**: [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- **Accessibility**: [WebAIM](https://webaim.org/)

---

## 📄 License

This project is licensed under the **MIT License** - see [LICENSE](LICENSE) file for details.

You are free to use, modify, and distribute this software for personal or commercial purposes.

---

## 🆘 Support & Contact

- **GitHub Issues** - Report bugs or request features
- **GitHub Discussions** - Ask questions and share ideas
- **Email** - support@eldercare-connect.com
- **Documentation** - Check docs folder for detailed guides

---

## 🙏 Acknowledgments

**Built with ❤️ for elderly care**

This project exists because we believe technology should bridge generational gaps, not widen them. Special thanks to:

- 🏥 Healthcare professionals who provided insights
- 👴👵 Elderly users who tested and gave feedback
- 👨‍💻 Open-source community and maintainers
- 🤝 All contributors who make this better

---

## 📊 Project Status

| Component        | Status              |
| ---------------- | ------------------- |
| Core Features    | ✅ Production Ready |
| Health Dashboard | ✅ Stable           |
| Emergency SOS    | ✅ Stable           |
| AI Companion     | ✅ Beta             |
| Mobile Support   | 📱 In Progress      |
| i18n Support     | 🌐 Planned          |

---

**Last Updated**: June 2026  
**Current Version**: 2.0.0  
**Status**: Active Development

---

_ElderCare Connect - Connecting families, improving health, one reminder at a time._ 🌟

**Questions? Start a [GitHub Discussion](https://github.com/yourusername/eldercare-connect/discussions)**
