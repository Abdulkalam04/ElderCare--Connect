// ============================================================================
// CRITICAL SECURITY GUARDRAIL: MUST RUN ONLY IN SERVER ENVIRONMENT
// DO NOT IMPORT IN FRONTEND / REACT COMPONENTS. EXPOSES SERVICE ROLE KEY.
// ============================================================================
if (typeof window !== 'undefined') {
    throw new Error("🚨 SECURITY DISASTER: This server-side file was bundled or executed on the client side!")
}

import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("❌ Production Failure: Missing critical Supabase environment variables.")
}

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type AlertType = 'missed_wellbeing' | 'missed_medicine' | 'no_activity'
type Severity = 'Low' | 'Medium' | 'High'

const COOLDOWN_HOURS: Record<AlertType, number> = {
    missed_wellbeing: 24,
    missed_medicine: 6,
    no_activity: 12
}

export async function checkEmergencies() {
    // Fix 1: Explicitly choosing Standard Option A Schema Configuration.
    // If your profiles primary key column is named 'user_id', replace 'id' with 'user_id' here.
    const { data: users, error } = await supabase
        .from('profiles')
        .select('id, created_at')
        .eq('is_active', true)

    if (error) {
        console.error('🔴 Error fetching active user profiles:', error.message)
        return
    }

    if (!users || users.length === 0) return

    const CONCURRENCY_LIMIT = 10
    for (let i = 0; i < users.length; i += CONCURRENCY_LIMIT) {
        const chunk = users.slice(i, i + CONCURRENCY_LIMIT)
        await Promise.all(
            chunk.map(user => checkUserEmergency(user.id, user.created_at))
        )
    }
}

async function checkUserEmergency(userId: string, profileCreatedAt: string) {
    const matchesGracePeriod = (Date.now() - new Date(profileCreatedAt).getTime()) < 24 * 60 * 60 * 1000
    if (matchesGracePeriod) {
        return
    }

    await Promise.all([
        checkWellbeing(userId),
        checkMedicines(userId),
        checkActivity(userId)
    ])
}

async function checkWellbeing(userId: string) {
    const { data, error } = await supabase
        .from('wellbeing_checks')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)

    if (error) {
        console.error(`❌ Error reading wellbeing checks for user ${userId}:`, error.message)
        return
    }

    const last = data?.[0]?.created_at
    if (!last) {
        await raiseAlert(userId, 'missed_wellbeing', 'High', 'No wellbeing check found')
        return
    }

    const hours = (Date.now() - new Date(last).getTime()) / 36e5
    if (hours > 24) {
        await raiseAlert(userId, 'missed_wellbeing', 'High', 'Missed daily wellbeing check')
    }
}

async function checkMedicines(userId: string) {
    // Fix 2: Implemented strict boundaries using `.lte()` and explicit `.not(..., 'is', null)`
    const { data, error } = await supabase
        .from('medicine_logs')
        .select('id, scheduled_time')
        .eq('user_id', userId)
        .eq('taken', false)
        .not('scheduled_time', 'is', null)
        .lte('scheduled_time', new Date().toISOString())

    if (error) {
        console.error(`❌ Error reading medicine logs for user ${userId}:`, error.message)
        return
    }

    if (data && data.length > 0) {
        await raiseAlert(
            userId,
            'missed_medicine',
            'Medium',
            `Missed ${data.length} medicine doses`
        )
    }
}

async function checkActivity(userId: string) {
    const { data, error } = await supabase
        .from('activity_logs')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)

    if (error) {
        console.error(`❌ Error reading activity logs for user ${userId}:`, error.message)
        return
    }

    const last = data?.[0]?.created_at
    if (!last) {
        await raiseAlert(userId, 'no_activity', 'High', 'No activity found')
        return
    }

    const hours = (Date.now() - new Date(last).getTime()) / 36e5
    if (hours > 48) {
        await raiseAlert(userId, 'no_activity', 'High', 'No app activity for 48 hours')
    }
}

async function raiseAlert(
    userId: string,
    type: AlertType,
    severity: Severity,
    message: string
) {
    const cooldownHours = COOLDOWN_HOURS[type]
    const cooldownThreshold = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString()

    const { data: existingAlerts, error: fetchError } = await supabase
        .from('emergency_alerts')
        .select('id')
        .eq('user_id', userId)
        .eq('alert_type', type)
        .gte('created_at', cooldownThreshold)
        .limit(1)

    if (fetchError) {
        console.error(`❌ Error evaluating cooldown for user ${userId}:`, fetchError.message)
        return
    }

    if (existingAlerts && existingAlerts.length > 0) {
        return
    }

    const { error: insertError } = await supabase.from('emergency_alerts').insert({
        user_id: userId,
        alert_type: type,
        severity,
        message,
        alert_day: new Date().toISOString().split('T')[0]
    })

    if (insertError) {
        console.error(`❌ Failed to insert alert record for user ${userId}:`, insertError.message)
        return
    }

    console.log(`🚨 ALERT RAISED: ${message} for user ${userId}`)
}