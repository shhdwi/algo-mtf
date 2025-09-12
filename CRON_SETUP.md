# Vercel Cron Jobs Setup

This document explains how to set up automated cron jobs for your trading system on Vercel.

## 📅 Cron Schedule

### 1. Daily Scan (3:15 PM IST, Monday-Friday)
- **Path**: `/api/cron/daily-scan`
- **Schedule**: `15 15 * * 1-5` (3:15 PM IST on weekdays)
- **Function**: Runs the ultimate scanner with position management
- **Duration**: Up to 800 seconds

### 2. Position Monitoring (Every 5 minutes during market hours)
- **Path**: `/api/cron/monitor-positions`
- **Schedule**: `*/5 9-15 * * 1-5` (Every 5 minutes from 9:00-15:59 IST on weekdays)
- **Function**: Monitors positions for exit signals and trailing levels
- **Duration**: Up to 300 seconds

## 🔧 Setup Instructions

### 1. Environment Variables
Add the following environment variable to your Vercel project:

```bash
CRON_SECRET=your_secure_random_string_here
```

**How to set:**
1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add `CRON_SECRET` with a secure random value
4. Make sure it's available for all environments (Production, Preview, Development)

### 2. Deploy Configuration
The `vercel.json` file already includes the cron configuration:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-scan",
      "schedule": "15 15 * * 1-5"
    },
    {
      "path": "/api/cron/monitor-positions", 
      "schedule": "*/5 9-15 * * 1-5"
    }
  ]
}
```

### 3. Deploy to Vercel
1. Push your changes to your Git repository
2. Vercel will automatically deploy and activate the cron jobs
3. Cron jobs will start running according to the schedule

## ⏰ Timezone Considerations

- **Cron Schedule**: Uses UTC time
- **IST Offset**: IST is UTC+5:30
- **Schedule Conversion**:
  - 3:15 PM IST = 9:45 AM UTC → `45 9 * * 1-5`
  - Market hours 9:15 AM - 3:30 PM IST = 3:45 AM - 10:00 AM UTC → `*/5 3-10 * * 1-5`

**Note**: The current configuration assumes the Vercel servers are running in IST timezone. If they're in UTC, you'll need to adjust:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-scan",
      "schedule": "45 9 * * 1-5"
    },
    {
      "path": "/api/cron/monitor-positions", 
      "schedule": "*/5 3-10 * * 1-5"
    }
  ]
}
```

## 🛡️ Security Features

1. **Authorization**: Each cron endpoint verifies the `CRON_SECRET`
2. **Time Validation**: Additional IST time checks prevent execution outside intended hours
3. **Weekday Validation**: Automatically skips weekends
4. **Market Hours Validation**: Position monitoring only runs during market hours

## 📊 Monitoring

### Cron Execution Logs
Check Vercel's Functions logs to monitor cron execution:
1. Go to Vercel Dashboard → Functions
2. Click on the cron function
3. View execution logs and response times

### Response Examples

**Successful Daily Scan:**
```json
{
  "success": true,
  "message": "Daily scan executed successfully",
  "scan_results": {
    "entry_signals": 5,
    "positions_created": 5
  },
  "timestamp": "2025-09-12T15:15:00.000Z"
}
```

**Position Monitoring:**
```json
{
  "success": true,
  "message": "Position monitoring executed successfully",
  "summary": {
    "positions_monitored": 9,
    "exit_signals": 0,
    "trailing_notifications": 1
  },
  "timestamp": "2025-09-12T09:20:00.000Z"
}
```

**Skipped (Weekend):**
```json
{
  "success": false,
  "message": "Skipped: Weekend day",
  "timestamp": "2025-09-14T15:15:00.000Z"
}
```

## 🔧 Testing

### Manual Testing
You can test the cron endpoints manually by making GET requests with proper authorization:

```bash
curl -H "Authorization: Bearer your_cron_secret" \
     https://your-app.vercel.app/api/cron/daily-scan

curl -H "Authorization: Bearer your_cron_secret" \
     https://your-app.vercel.app/api/cron/monitor-positions
```

### Local Development
For local testing, set the `CRON_SECRET` environment variable and make requests to:
- `http://localhost:3000/api/cron/daily-scan`
- `http://localhost:3000/api/cron/monitor-positions`

## 📝 Notes

1. **Vercel Hobby Plan**: Limited to 1 cron job. Upgrade to Pro for multiple crons.
2. **Function Timeout**: Daily scan has 800s timeout, monitoring has 300s timeout.
3. **Region**: Functions run in Mumbai (bom1) region for better latency.
4. **WhatsApp Notifications**: Both crons send WhatsApp notifications when conditions are met.
5. **Database Updates**: All position data is automatically updated in Supabase.

## 🚨 Troubleshooting

### Common Issues

1. **Cron not executing**: Check if `CRON_SECRET` is set correctly
2. **Timezone issues**: Verify if cron schedule matches your expected IST times
3. **Function timeout**: Monitor execution times and adjust `maxDuration` if needed
4. **API failures**: Check internal API responses and error logs

### Emergency Manual Execution
If cron jobs fail, you can manually trigger them:
1. Daily scan: `POST /api/daily-scan`
2. Position monitoring: `POST /api/monitor-positions`

Both endpoints accept the same parameters as the cron versions but without authorization requirements.
