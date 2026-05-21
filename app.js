import express        from 'express'
import http           from 'http'
import { Server }     from 'socket.io'
import session        from 'express-session'
import helmet         from 'helmet'
import cors           from 'cors'
import morgan         from 'morgan'
import path           from 'path'
import { fileURLToPath } from 'url'

import { env, testConnection } from './config/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const app    = express()
const server = http.createServer(app)
const io     = new Server(server, {
    cors: {
        origin     : env.origin,
        methods    : ['GET', 'POST'],
        credentials: true
    }
})

app.use(helmet({
    contentSecurityPolicy: false
}))

app.use(cors({
    origin     : env.origin,
    credentials: true
}))

app.use(morgan(env.isDev ? 'dev' : 'combined'))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

app.use(session({
    secret           : env.sessionSecret,
    resave           : false,
    saveUninitialized: false,
    cookie: {
        secure  : !env.isDev,
        httpOnly: true,
        maxAge  : 7 * 24 * 60 * 60 * 1000
    }
}))

app.use(express.static(path.join(__dirname, 'public')))
app.use('/assets', express.static(path.join(__dirname, 'assets')))

const bootstrap = async () => {
    const connected = await testConnection()

    if (!connected) {
        console.error('[app] database connection failed, exiting')
        process.exit(1)
    }

    const { default: routes }       = await import('./routes/index.js')
    const { initSocket }            = await import('./socket/index.js')

    app.use('/api', routes)

    initSocket(io)

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'auth.html'))
    })

    app.use((err, req, res, next) => {
        console.error('[error]', err.message)
        res.status(err.status || 500).json({
            success: false,
            message: env.isDev ? err.message : 'Internal server error'
        })
    })

    server.listen(env.port, () => {
        console.log(`[app] running on port ${env.port} (${env.nodeEnv})`)
    })
}

bootstrap()

export { io }