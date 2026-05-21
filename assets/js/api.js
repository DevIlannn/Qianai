import { Store } from './store.js'

const BASE = '/api'

const req = async (method, path, body = null, raw = false) => {
    const token   = Store.getToken()
    const headers = { 'Content-Type': 'application/json' }

    if (token) headers['x-session-token'] = token

    const opts = { method, headers, credentials: 'include' }
    if (body)  opts.body = JSON.stringify(body)

    const res  = await fetch(`${BASE}${path}`, opts)
    const data = await res.json()

    if (!res.ok) throw Object.assign(new Error(data.message || 'Request gagal'), { status: res.status })

    return raw ? data : data
}

const get  = (path)        => req('GET',    path)
const post = (path, body)  => req('POST',   path, body)
const patch = (path, body) => req('PATCH',  path, body)
const del  = (path)        => req('DELETE', path)


export const AuthAPI = {
    getRegisterOptions  : ()       => get('/auth/register/options'),
    verifyRegister      : (body)   => post('/auth/register/verify', body),
    getLoginOptions     : ()       => get('/auth/login/options'),
    verifyLogin         : (body)   => post('/auth/login/verify', body),
    logout              : ()       => post('/auth/logout')
}

export const UserAPI = {
    me                  : ()       => get('/user/me'),
    update              : (body)   => patch('/user/me', body)
}

export const PairAPI = {
    getQr               : ()       => get('/pair/qr'),
    scan                : (token)  => post('/pair/scan', { token }),
    status              : ()       => get('/pair/status')
}

export const MessageAPI = {
    list    : (pairId, before, limit) => get(`/messages/${pairId}?before=${before || ''}&limit=${limit || 50}`),
    send    : (body)                  => post('/messages', body),
    delete  : (id)                    => del(`/messages/${id}`),
    addMedia: (id, body)              => post(`/messages/${id}/media`, body)
}

export const SyncAPI = {
    push    : (pairId, messages)     => post('/sync', { pairId, messages }),
    pull    : (pairId, since, limit) => get(`/sync/${pairId}?since=${since || ''}&limit=${limit || 100}`)
}