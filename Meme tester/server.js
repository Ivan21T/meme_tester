const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');
const sharp = require('sharp');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['*'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/test-image', async (req, res) => {
    const { url } = req.body;
    const startTime = Date.now();
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const result = await tryAllMethods(url, startTime);
        res.json(result);
    } catch (error) {
        console.error('Error:', error);
        
        try {
            const fallbackResult = await proxyFetch(url, startTime);
            res.json(fallbackResult);
        } catch (fallbackError) {
            res.status(500).json({ 
                error: 'Failed to load image',
                message: error.message 
            });
        }
    }
});

app.get('/proxy-image', async (req, res) => {
    const imageUrl = req.query.url;
    
    if (!imageUrl) {
        return res.status(400).send('URL parameter is required');
    }

    try {
        const response = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': new URL(imageUrl).origin,
                'Cache-Control': 'no-cache'
            },
            maxRedirects: 5,
            timeout: 30000
        });

        res.set({
            'Content-Type': response.headers['content-type'],
            'Content-Length': response.headers['content-length'],
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
        });

        response.data.pipe(res);
    } catch (error) {
        console.error('Proxy error:', error.message);
        res.status(500).send('Failed to proxy image');
    }
});

async function tryAllMethods(url, startTime) {
    const methods = [
        directFetch,
        proxyFetch,
        imageProxyFetch
    ];

    let lastError = null;

    for (const method of methods) {
        try {
            const result = await method(url, startTime);
            if (result && result.success) {
                return result;
            }
        } catch (error) {
            lastError = error;
            continue;
        }
    }

    throw lastError || new Error('All methods failed');
}

async function directFetch(url, startTime) {
    const dnsStart = Date.now();
    
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': new URL(url).origin
        },
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: status => status >= 200 && status < 300
    });

    const dnsTime = Date.now() - dnsStart;
    const endTime = Date.now();
    
    const buffer = Buffer.from(response.data);
    const size = buffer.length;
    
    return {
        success: true,
        url,
        totalTime: endTime - startTime,
        dnsTime,
        downloadTime: endTime - startTime - dnsTime,
        size,
        sizeFormatted: formatBytes(size),
        speed: calculateSpeed(size, endTime - startTime),
        protocol: detectProtocol(response),
        headers: parseHeaders(response.headers),
        method: 'Direct Fetch',
        imageUrl: `/proxy-image?url=${encodeURIComponent(url)}`,
        contentType: response.headers['content-type']
    };
}

async function proxyFetch(url, startTime) {
    const dnsStart = Date.now();
    
    const response = await axios.get(`http://localhost:${PORT}/proxy-image?url=${encodeURIComponent(url)}`, {
        responseType: 'arraybuffer',
        timeout: 10000
    });

    const dnsTime = Date.now() - dnsStart;
    const endTime = Date.now();
    
    const buffer = Buffer.from(response.data);
    const size = buffer.length;
    
    return {
        success: true,
        url,
        totalTime: endTime - startTime,
        dnsTime,
        downloadTime: endTime - startTime - dnsTime,
        size,
        sizeFormatted: formatBytes(size),
        speed: calculateSpeed(size, endTime - startTime),
        protocol: 'HTTP/2',
        headers: [],
        method: 'Server Proxy',
        imageUrl: `/proxy-image?url=${encodeURIComponent(url)}`,
        contentType: response.headers['content-type']
    };
}

async function imageProxyFetch(url, startTime) {
    const imageProxies = [
        'https://proxy.duckduckgo.com/iu/?u=',
        'https://wsrv.nl/?url=',
        'https://images.weserv.nl/?url='
    ];

    const dnsStart = Date.now();

    for (const proxy of imageProxies) {
        try {
            const response = await axios.get(proxy + encodeURIComponent(url), {
                responseType: 'arraybuffer',
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });

            const dnsTime = Date.now() - dnsStart;
            const endTime = Date.now();
            
            const buffer = Buffer.from(response.data);
            const size = buffer.length;
            
            if (size > 1000) {
                return {
                    success: true,
                    url,
                    totalTime: endTime - startTime,
                    dnsTime,
                    downloadTime: endTime - startTime - dnsTime,
                    size,
                    sizeFormatted: formatBytes(size),
                    speed: calculateSpeed(size, endTime - startTime),
                    protocol: 'HTTP/2',
                    headers: [],
                    method: 'Image Proxy',
                    imageUrl: `/proxy-image?url=${encodeURIComponent(url)}`,
                    contentType: response.headers['content-type']
                };
            }
        } catch (e) {
            continue;
        }
    }

    throw new Error('All image proxies failed');
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function calculateSpeed(bytes, timeMs) {
    if (bytes <= 0 || timeMs <= 0) return 0;
    const seconds = timeMs / 1000;
    const mb = bytes / (1024 * 1024);
    return mb / seconds;
}

function detectProtocol(response) {
    const headers = response.headers;
    
    if (response.request?.res?.httpVersion) {
        return `HTTP/${response.request.res.httpVersion}`;
    }
    
    if (headers['cf-ray']) return 'HTTP/2 (Cloudflare)';
    if (headers['alt-svc']) return 'HTTP/3';
    
    return 'HTTP/2';
}

function parseHeaders(headers) {
    const important = [
        'content-type', 'content-length', 'cache-control',
        'etag', 'last-modified', 'server', 'x-cache',
        'cf-cache-status', 'age', 'accept-ranges', 'vary'
    ];
    
    const result = [];
    
    for (const [key, value] of Object.entries(headers)) {
        if (important.includes(key.toLowerCase())) {
            result.push({ key, value });
        }
    }
    
    return result;
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});