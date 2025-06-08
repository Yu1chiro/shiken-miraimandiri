class SecureFormMonitor {
    constructor() {
        // Konfigurasi Telegram Bot
        this.telegramBotToken = '8103925608:AAHZhakw51SfAkCmR8TZt08SZ867SpzwdNo';
        this.telegramChatId = '1207734967';
        
        // State management
        this.violationCount = parseInt(localStorage.getItem('violationCount') || '0');
        this.isFormHidden = localStorage.getItem('isFormHidden') === 'true';
        this.timerInterval = null;
        this.clockInterval = null;
        this.initialPenaltyDuration = 30;
        this.penaltyIncrement = 30;
        
        // Enhanced detection states
        this.isSplitScreenActive = false;
        this.isPictureInPictureActive = false;
        this.continuousViolationCheck = null;
        this.originalDimensions = {
            width: window.innerWidth,
            height: window.innerHeight,
            outerWidth: window.outerWidth,
            outerHeight: window.outerHeight
        };
        
        // Tolerance levels for different screen sizes
        this.tolerances = {
            mobile: {
                width: 50,  // Lebih ketat untuk mobile
                height: 80  // Keyboard bisa mempengaruhi height
            },
            desktop: {
                width: 100,
                height: 100
            }
        };
        
        // Check for existing penalty
        this.restorePenaltyState();
        
        this.initializeMonitoring();
        this.setupEventListeners();
    }

    restorePenaltyState() {
        const penaltyEndTime = localStorage.getItem('penaltyEndTime');
        
        if (penaltyEndTime) {
            const endTime = new Date(penaltyEndTime);
            const now = new Date();
            const remainingMs = endTime.getTime() - now.getTime();
            
            if (remainingMs > 0) {
                this.remainingTime = Math.ceil(remainingMs / 1000);
                this.isFormHidden = true;
                
                console.log(`Penalty restored: ${this.remainingTime} seconds remaining`);
                
                setTimeout(() => {
                    this.showPenaltyOverlay(true);
                }, 100);
            } else {
                this.clearPenaltyStorage();
            }
        }
    }

    initializeMonitoring() {
        this.deviceInfo = {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            screenResolution: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timestamp: new Date().toISOString(),
            isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        };
        
        console.log('Monitoring initialized for device:', this.deviceInfo);
    }
    
    setupEventListeners() {
        // Deteksi tab change/blur
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                setTimeout(() => {
                    if (document.hidden) {
                        this.handleViolation('Tab switching detected');
                    }
                }, 100);
            }
        });
        
        // Deteksi window blur
        let blurTimeout;
        window.addEventListener('blur', () => {
            blurTimeout = setTimeout(() => {
                if (!document.hasFocus()) {
                    this.handleViolation('Browser window left');
                }
            }, 500);
        });
        
        window.addEventListener('focus', () => {
            if (blurTimeout) {
                clearTimeout(blurTimeout);
            }
        });
        
        // Block dangerous keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey && (e.key === 't' || e.key === 'n')) || 
                (e.ctrlKey && e.shiftKey && e.key === 'N') ||
                (e.altKey && e.key === 'Tab')) {
                e.preventDefault();
                this.handleViolation('Keyboard shortcut violation: ' + (e.ctrlKey ? 'Ctrl+' : 'Alt+') + e.key);
            }
        });
        
        // Deteksi developer tools
        let devtools = {open: false};
        const checkDevTools = () => {
            const widthThreshold = window.outerWidth - window.innerWidth > 160;
            const heightThreshold = window.outerHeight - window.innerHeight > 160;
            
            if ((widthThreshold || heightThreshold) && !devtools.open) {
                devtools.open = true;
                this.handleViolation('Developer tools opened');
            } else if (!widthThreshold && !heightThreshold) {
                devtools.open = false;
            }
        };
        
        let element = new Image();
        Object.defineProperty(element, 'id', {
            get: () => {
                if (!devtools.open) {
                    devtools.open = true;
                    this.handleViolation('Console accessed');
                }
            }
        });
        
        setInterval(() => {
            checkDevTools();
            console.log(element);
        }, 1000);
        
        // Enhanced mobile-specific detection
        if (this.deviceInfo.isMobile) {
            this.setupEnhancedMobileDetection();
        } else {
            this.setupEnhancedDesktopDetection();
        }
        
        // Common protections
        document.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('selectstart', (e) => e.preventDefault());
        document.addEventListener('dragstart', (e) => e.preventDefault());
        
        // Start continuous monitoring
        this.startContinuousMonitoring();
    }
    
    setupEnhancedMobileDetection() {
        let lastWidth = window.innerWidth;
        let lastHeight = window.innerHeight;
        let orientationChangeTimeout;
        
        const checkScreenSize = () => {
            const currentWidth = window.innerWidth;
            const currentHeight = window.innerHeight;
            const tolerance = this.tolerances.mobile;
            
            // Periksa perubahan yang signifikan (bukan karena keyboard virtual)
            const widthChange = Math.abs(currentWidth - lastWidth);
            const heightChange = Math.abs(currentHeight - lastHeight);
            
            // Lebih ketat untuk deteksi split-screen
            if (widthChange > tolerance.width && heightChange > tolerance.height) {
                this.isSplitScreenActive = true;
                this.handleViolation('Split-screen/Multi-window detected on mobile');
            } else if (widthChange <= 10 && heightChange <= 10) {
                // Reset hanya jika kembali ke ukuran normal
                if (this.isSplitScreenActive) {
                    this.isSplitScreenActive = false;
                    console.log('Split-screen deactivated - screen returned to normal');
                }
            }
            
            lastWidth = currentWidth;
            lastHeight = currentHeight;
        };
        
        // Deteksi orientation change vs split-screen
        window.addEventListener('orientationchange', () => {
            orientationChangeTimeout = setTimeout(() => {
                // Update baseline setelah orientation change
                lastWidth = window.innerWidth;
                lastHeight = window.innerHeight;
                this.originalDimensions.width = window.innerWidth;
                this.originalDimensions.height = window.innerHeight;
            }, 500);
        });
        
        window.addEventListener('resize', () => {
            if (orientationChangeTimeout) {
                clearTimeout(orientationChangeTimeout);
                orientationChangeTimeout = setTimeout(() => {
                    checkScreenSize();
                }, 300);
            } else {
                checkScreenSize();
            }
        });
        
        // Enhanced Picture-in-Picture detection
        if ('pictureInPictureEnabled' in document) {
            document.addEventListener('enterpictureinpicture', (e) => {
                this.isPictureInPictureActive = true;
                console.log('PiP activated');
                this.handleViolation('Picture-in-Picture mode activated');
            });
            
            document.addEventListener('leavepictureinpicture', (e) => {
                this.isPictureInPictureActive = false;
                console.log('PiP deactivated');
            });
        }
        
        // Enhanced multi-window detection untuk Android
        if (window.visualViewport) {
            let lastScale = window.visualViewport.scale;
            let lastVVWidth = window.visualViewport.width;
            let lastVVHeight = window.visualViewport.height;
            
            window.visualViewport.addEventListener('resize', () => {
                const currentScale = window.visualViewport.scale;
                const currentVVWidth = window.visualViewport.width;
                const currentVVHeight = window.visualViewport.height;
                
                // Deteksi jika ada perubahan yang tidak wajar
                if (currentScale < 0.9 || 
                    Math.abs(currentVVWidth - lastVVWidth) > 100 ||
                    Math.abs(currentVVHeight - lastVVHeight) > 100) {
                    this.isSplitScreenActive = true;
                    this.handleViolation('Advanced multi-window/split-view detected');
                }
                
                lastScale = currentScale;
                lastVVWidth = currentVVWidth;
                lastVVHeight = currentVVHeight;
            });
        }
    }
    
    setupEnhancedDesktopDetection() {
        let lastWidth = window.innerWidth;
        let lastHeight = window.innerHeight;
        
        const checkDesktopResize = () => {
            const currentWidth = window.innerWidth;
            const currentHeight = window.innerHeight;
            const tolerance = this.tolerances.desktop;
            
            const widthChange = Math.abs(currentWidth - lastWidth);
            const heightChange = Math.abs(currentHeight - lastHeight);
            
            // Deteksi snap window atau split-screen di desktop
            if (widthChange > tolerance.width || heightChange > tolerance.height) {
                // Periksa apakah window di-snap ke sisi layar
                if (currentWidth < (screen.width * 0.8) || currentHeight < (screen.height * 0.8)) {
                    this.isSplitScreenActive = true;
                    this.handleViolation('Window snapping/split-screen detected on desktop');
                }
            } else if (widthChange <= 20 && heightChange <= 20) {
                if (this.isSplitScreenActive) {
                    this.isSplitScreenActive = false;
                    console.log('Split-screen deactivated - window returned to normal size');
                }
            }
            
            lastWidth = currentWidth;
            lastHeight = currentHeight;
        };
        
        window.addEventListener('resize', checkDesktopResize);
    }
    
    startContinuousMonitoring() {
        // Monitor setiap 2 detik untuk memastikan state violation masih aktif
        this.continuousViolationCheck = setInterval(() => {
            if (this.isSplitScreenActive && !this.isFormHidden) {
                console.log('Continuous violation: Split-screen still active');
                this.handleViolation('Split-screen/Multi-window still active - continuous violation');
            }
            
            if (this.isPictureInPictureActive && !this.isFormHidden) {
                console.log('Continuous violation: Picture-in-Picture still active');
                this.handleViolation('Picture-in-Picture still active - continuous violation');
            }
            
            // Tambahan: Periksa ukuran window secara berkala
            this.checkWindowIntegrity();
        }, 2000);
    }
    
    checkWindowIntegrity() {
        const currentRatio = window.innerWidth / window.innerHeight;
        const originalRatio = this.originalDimensions.width / this.originalDimensions.height;
        
        // Jika rasio aspect berubah drastis, kemungkinan ada split-screen
        const ratioChange = Math.abs(currentRatio - originalRatio) / originalRatio;
        
        if (ratioChange > 0.3 && !this.isSplitScreenActive) {
            this.isSplitScreenActive = true;
            this.handleViolation('Aspect ratio violation - possible split-screen detected');
        }
        
        // Reset jika rasio kembali normal
        if (ratioChange <= 0.1 && this.isSplitScreenActive) {
            // Periksa juga ukuran absolut
            const widthNormal = Math.abs(window.innerWidth - this.originalDimensions.width) <= 50;
            const heightNormal = Math.abs(window.innerHeight - this.originalDimensions.height) <= 50;
            
            if (widthNormal && heightNormal) {
                this.isSplitScreenActive = false;
                console.log('Window integrity restored');
            }
        }
    }
    
    async handleViolation(violationType) {
        if (this.isFormHidden) return;
        
        this.violationCount++;
        localStorage.setItem('violationCount', this.violationCount.toString());
        this.updateViolationDisplay();
        
        // Set violation message
        const violationMessage = document.getElementById('violation-message');
        if (violationMessage) {
            let message = 'Anda terdeteksi ';
            
            if (violationType.includes('Tab switching')) {
                message += 'membuka tab baru atau berpindah aplikasi.';
            } else if (violationType.includes('Split-screen') || violationType.includes('Multi-window') || violationType.includes('snapping')) {
                message += 'menggunakan split-screen/multi-window. Kembalikan layar ke mode penuh untuk melanjutkan.';
            } else if (violationType.includes('Picture-in-Picture')) {
                message += 'mengaktifkan Picture-in-Picture. Matikan mode PiP untuk melanjutkan.';
            } else if (violationType.includes('continuous violation')) {
                message += 'masih dalam mode pelanggaran. Kembalikan layar ke kondisi normal.';
            } else {
                message += 'melakukan pelanggaran keamanan.';
            }
            
            violationMessage.textContent = message;
        }
        
        await this.sendTelegramNotification(violationType);
        this.showPenaltyOverlay();
        
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = 'Pelanggaran';
            statusElement.parentElement.className = 
                'inline-block px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm';
        }
    }
    
    async sendTelegramNotification(violationType) {
        const penaltyDuration = this.initialPenaltyDuration + ((this.violationCount - 1) * this.penaltyIncrement);
        
        const message = `
🚨 *SECURITY ALERT* 🚨

*Device Info:*
• Platform: ${this.deviceInfo.platform}
• User Agent: ${this.deviceInfo.userAgent}
• Screen: ${this.deviceInfo.screenResolution}
• Current Size: ${window.innerWidth}x${window.innerHeight}
• Timezone: ${this.deviceInfo.timezone}
• Language: ${this.deviceInfo.language}
• Mobile: ${this.deviceInfo.isMobile ? 'Yes' : 'No'}

*Violation Details:*
• Type: ${violationType}
• Count: ${this.violationCount}
• Split-Screen Active: ${this.isSplitScreenActive ? 'Yes' : 'No'}
• PiP Active: ${this.isPictureInPictureActive ? 'Yes' : 'No'}
• Penalty: ${penaltyDuration} seconds
• Time: ${new Date().toLocaleString('id-ID')}

*Action Taken:*
Form access blocked for ${penaltyDuration} seconds
        `.trim();
        
        try {
            const response = await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: this.telegramChatId,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });
            
            if (!response.ok) {
                console.error('Failed to send Telegram notification:', await response.text());
            }
        } catch (error) {
            console.error('Error sending Telegram notification:', error);
        }
    }
    
    showPenaltyOverlay(isRestore = false) {
        this.isFormHidden = true;
        
        if (!isRestore) {
            this.remainingTime = this.initialPenaltyDuration + ((this.violationCount - 1) * this.penaltyIncrement);
            
            const penaltyEndTime = new Date();
            penaltyEndTime.setSeconds(penaltyEndTime.getSeconds() + this.remainingTime);
            localStorage.setItem('penaltyEndTime', penaltyEndTime.toISOString());
        }
        
        localStorage.setItem('isFormHidden', 'true');
        
        const googleForm = document.getElementById('google-form');
        const violationOverlay = document.getElementById('violation-overlay');
        const currentViolation = document.getElementById('current-violation');
        
        if (googleForm) googleForm.style.display = 'none';
        if (violationOverlay) violationOverlay.classList.remove('hidden');
        if (currentViolation) currentViolation.textContent = this.violationCount;
        
        this.updateTimerDisplay();
        this.updateTimerCircle();
        
        setTimeout(() => {
            this.startTimer();
        }, 100);
    }
    
    startTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        this.timerInterval = setInterval(() => {
            if (this.remainingTime > 0) {
                this.remainingTime--;
                
                const penaltyEndTime = new Date();
                penaltyEndTime.setSeconds(penaltyEndTime.getSeconds() + this.remainingTime);
                localStorage.setItem('penaltyEndTime', penaltyEndTime.toISOString());
                
                this.updateTimerDisplay();
                this.updateTimerCircle();
                
                // Periksa apakah masih ada pelanggaran aktif
                if (this.remainingTime <= 0) {
                    if (this.isSplitScreenActive || this.isPictureInPictureActive) {
                        // Extend penalty jika masih dalam mode pelanggaran
                        console.log('Extending penalty - violation still active');
                        this.remainingTime = 30; // Tambah 30 detik lagi
                        this.handleViolation('Penalty extended - violation mode still active');
                    } else {
                        this.endPenalty();
                    }
                }
            }
        }, 1000);
    }
    
    updateTimerDisplay() {
        const safeRemainingTime = Math.max(0, this.remainingTime);
        const minutes = Math.floor(safeRemainingTime / 60);
        const seconds = safeRemainingTime % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const timerDisplay = document.getElementById('timer-display');
        if (timerDisplay) {
            timerDisplay.textContent = timeString;
            
            if (safeRemainingTime <= 10) {
                timerDisplay.style.color = '#dc2626';
                timerDisplay.style.animation = 'pulse 0.5s infinite';
            } else if (safeRemainingTime <= 30) {
                timerDisplay.style.color = '#ea580c';
                timerDisplay.style.animation = 'none';
            } else {
                timerDisplay.style.color = '#ef4444';
                timerDisplay.style.animation = 'none';
            }
        }
    }
    
    updateTimerCircle() {
        const totalTime = this.initialPenaltyDuration + ((this.violationCount - 1) * this.penaltyIncrement);
        const safeRemainingTime = Math.max(0, this.remainingTime);
        const elapsedTime = totalTime - safeRemainingTime;
        const percentage = totalTime > 0 ? (elapsedTime / totalTime) * 100 : 0;
        const degrees = (percentage / 100) * 360;
        
        const timerCircle = document.getElementById('timer-circle');
        if (timerCircle) {
            timerCircle.style.background = `conic-gradient(#ef4444 ${degrees}deg, #fee2e2 ${degrees}deg)`;
        }
    }
    
    endPenalty() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        this.isFormHidden = false;
        this.remainingTime = 0;
        this.clearPenaltyStorage();
        
        const googleForm = document.getElementById('google-form');
        const violationOverlay = document.getElementById('violation-overlay');
        
        if (googleForm) googleForm.style.display = 'block';
        if (violationOverlay) violationOverlay.classList.add('hidden');
        
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = 'Aktif';
            statusElement.parentElement.className = 
                'inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm';
        }
    }
    
    clearPenaltyStorage() {
        localStorage.removeItem('penaltyEndTime');
        localStorage.setItem('isFormHidden', 'false');
    }
    
    updateViolationDisplay() {
        const violationCountElement = document.getElementById('violation-count');
        if (violationCountElement) {
            violationCountElement.textContent = this.violationCount;
        }
    }
    
    // Cleanup method
    destroy() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        if (this.continuousViolationCheck) {
            clearInterval(this.continuousViolationCheck);
        }
    }
}

// Initialize monitoring when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.secureMonitor = new SecureFormMonitor();
    
    setTimeout(() => {
        Swal.fire({
        html: `<h1 class="text-2xl text-amber-700 font-semibold">Perhatian !</h1>
            <div class="text-center leading-relaxed space-y-3 text-sm md:text-base text-gray-800">
            <p class="font-semibold text-red-600 text-lg md:text-xl">
                Form dilindungi dengan sistem keamanan
            </p>
            <p>
                Jangan <span class="font-semibold">berpindah tab</span>, membuka <span class="font-semibold">aplikasi lain</span>, atau melakukan <span class="font-semibold">split-screen</span> selama mengisi form.
            </p>
            <p>
                Jika Anda melanggar, <span class="text-red-500 font-medium">sistem akan memberikan Penalti</span> durasi Penalti pertama yakni 30 detik. Penalti akan terus bertambah berdasarkan jumlah Pinalti yg anda terima.
            </p>
            </div>
            `,
  icon: 'warning',
  showCancelButton: false,
  confirmButtonText: '✅ Saya Mengerti',
  allowOutsideClick: false,
  allowEscapeKey: false,
  customClass: {
    popup: 'p-6 rounded-xl',
    confirmButton: 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm',
  },
        }).then((result) => {
            if (result.isConfirmed) {
                console.log('Pengguna menyetujui peringatan keamanan');
            } else {
                console.log('Pengguna membatalkan atau belum siap');
            }
        });
    }, 2000);
});

// Prevent common navigation methods
window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = 'Apakah Anda yakin ingin meninggalkan halaman ini?';
});

// Block back button
history.pushState(null, null, location.href);
window.addEventListener('popstate', () => {
    history.go(1);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.secureMonitor) {
        window.secureMonitor.destroy();
    }
});