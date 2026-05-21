import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

export const env = {
    port           : process.env.PORT || 3000,
    nodeEnv        : process.env.NODE_ENV || 'development',
    databaseUrl    : process.env.DATABASE_URL,
    sessionSecret  : process.env.SESSION_SECRET,
    sessionExpires : process.env.SESSION_EXPIRES || '7d',
    rpName         : process.env.RP_NAME || 'Qianai',
    rpId           : process.env.RP_ID || 'localhost',
    origin         : process.env.ORIGIN || 'http://localhost:3000',
    isDev          : process.env.NODE_ENV !== 'production'
}

export const db = new Pool({
    connectionString : env.databaseUrl,
    ssl              : env.isDev ? false : { rejectUnauthorized: false },
    max              : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
})

db.on('error', (err) => {
    console.error('[db] unexpected error:', err.message)
})

export const testConnection = async () => {
    try {
        const client = await db.connect()
        const result = await client.query('SELECT NOW()')
        client.release()
        console.log('[db] connected at', result.rows[0].now)
        return true
    } catch (err) {
        console.error('[db] connection failed:', err.message)
        return false
    }
}

export const TABLES = {
    users       : 'users_qianai',
    credentials : 'credentials_qianai',
    sessions    : 'sessions_qianai',
    pairs       : 'pairs_qianai',
    pairTokens  : 'pair_tokens_qianai',
    messages    : 'messages_qianai',
    media       : 'media_qianai',
    ipLogs      : 'ip_logs_qianai'
}

export const PAIR_STATUS = {
    pending : 'pending',
    active  : 'active',
    ended   : 'ended'
}

export const MESSAGE_TYPE = {
    text  : 'text',
    image : 'image',
    video : 'video',
    file  : 'file'
}

export const MESSAGE_STATUS = {
    sent      : 'sent',
    delivered : 'delivered',
    read      : 'read'
}

export const TOKEN_EXPIRES_MINUTES = 10