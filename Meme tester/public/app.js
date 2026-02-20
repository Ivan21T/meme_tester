class UniversalImageTester {
    constructor() {
        this.testBtn = document.getElementById('testBtn');
        this.urlInput = document.getElementById('imageUrl');
        this.resultsDiv = document.getElementById('results');
        this.abortController = null;
        this.init();
    }
    
    init() {
        this.testBtn.addEventListener('click', () => this.testImage());
        
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.testImage();
        });
        
        document.querySelectorAll('.example-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.urlInput.value = btn.dataset.url;
                this.testImage();
            });
        });
    }
    
    async testImage() {
        const url = this.urlInput.value.trim();
        
        if (!url) {
            this.showError('Моля, въведете URL на изображение');
            return;
        }
        
        if (this.abortController) {
            this.abortController.abort();
        }
        
        this.abortController = new AbortController();
        this.showLoading();
        
        try {
            const response = await fetch('/api/test-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url }),
                signal: this.abortController.signal
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.displayResults(data);
            } else {
                this.showError(data.error || 'Грешка при зареждане');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Request aborted');
            } else {
                console.error('Error:', error);
                this.showError('Грешка при комуникация със сървъра');
            }
        }
    }
    
    showLoading() {
        this.resultsDiv.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <div style="color: #94a3b8;">Тестване...</div>
            </div>
        `;
    }
    
    displayResults(data) {
        const date = new Date().toLocaleTimeString();
        
        this.resultsDiv.innerHTML = `
            <div class="stats-dashboard">
                <div class="stat-card">
                    <div class="stat-label">Total Time</div>
                    <div class="stat-value">${data.totalTime.toFixed(0)}<span class="stat-unit">ms</span></div>
                    <div class="stat-trend">DNS: ${data.dnsTime.toFixed(0)}ms</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-label">File Size</div>
                    <div class="stat-value">${data.sizeFormatted}</div>
                    <div class="stat-trend">${data.size.toLocaleString()} bytes</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-label">Speed</div>
                    <div class="stat-value">${data.speed.toFixed(2)}<span class="stat-unit">MB/s</span></div>
                    <div class="stat-trend">${(data.speed * 8).toFixed(2)} Mbps</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-label">Method</div>
                    <div class="stat-value" style="font-size: 1rem;">${data.method}</div>
                    <div class="stat-trend">${data.protocol}</div>
                </div>
            </div>
            
            <div class="image-container">
                <img src="${data.imageUrl}" alt="Loaded image" crossorigin="anonymous">
            </div>
            
            <div class="details-grid">
                <div class="headers-panel">
                    <div class="panel-title">
                        <span>📋 HTTP Headers</span>
                        <span class="protocol-badge">${data.protocol}</span>
                    </div>
                    ${data.headers.length > 0 ? 
                        data.headers.map(h => 
                            `<div class="header-item"><strong>${h.key}:</strong> ${h.value}</div>`
                        ).join('') : 
                        '<div class="header-item">Headers не са достъпни</div>'
                    }
                    <div class="success-rate">✓ Заредено в ${date}</div>
                </div>
                
                <div class="timing-panel">
                    <div class="panel-title"> Time Breakdown</div>
                    <div class="timeline">
                        <div class="timeline-item">
                            <span class="timeline-label">DNS</span>
                            <div class="timeline-bar">
                                <div class="timeline-fill" style="width: ${(data.dnsTime / Math.max(data.totalTime, 1)) * 100}%"></div>
                            </div>
                            <span class="timeline-value">${data.dnsTime.toFixed(1)}ms</span>
                        </div>
                        
                        <div class="timeline-item">
                            <span class="timeline-label">Download</span>
                            <div class="timeline-bar">
                                <div class="timeline-fill" style="width: ${(data.downloadTime / Math.max(data.totalTime, 1)) * 100}%"></div>
                            </div>
                            <span class="timeline-value">${data.downloadTime.toFixed(1)}ms</span>
                        </div>
                        
                        <div class="timeline-item">
                            <span class="timeline-label">Total</span>
                            <div class="timeline-bar">
                                <div class="timeline-fill" style="width: 100%"></div>
                            </div>
                            <span class="timeline-value">${data.totalTime.toFixed(1)}ms</span>
                        </div>
                    </div>
                    
                    <div style="margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 12px;">
                        <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 5px;">Content Type:</div>
                        <div style="color: #60a5fa; font-size: 0.9rem; word-break: break-all;">${data.contentType || 'N/A'}</div>
                    </div>
                    
                    <div style="margin-top: 10px; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 12px;">
                        <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 5px;">URL:</div>
                        <div style="color: #a78bfa; font-size: 0.8rem; word-break: break-all;">${data.url}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    showError(message) {
        this.resultsDiv.innerHTML = `
            <div class="error-message">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 15px;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h3 style="margin-bottom: 10px;">${message}</h3>
                <div style="margin-top: 20px; font-size: 0.9rem; color: #94a3b8;">
                    Съвет: Опитайте директен линк или изображение от популярен сайт
                </div>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new UniversalImageTester();
});