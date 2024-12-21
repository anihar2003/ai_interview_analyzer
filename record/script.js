const G_API = process.env.G_API;
let mediaRecorder;
let audioChunks = [];
let startTime;
let timerInterval;
let audioContext;
let analyser;
let visualizerCanvas;
let canvasCtx;
let animationFrame;
let recognition;
let isRecognizing = false;

// Get DOM elements
const recordButton = document.getElementById('recordButton');
const timer = document.getElementById('timer');
const visualizer = document.getElementById('visualizer');
const recordingStatus = document.getElementById('recordingStatus');
const analyzeButton = document.getElementById('analyzeButton');
const resetButton = document.getElementById('resetButton');
const result = document.getElementById('result');
const jobDescInput = document.getElementById('job-desc');

// Initialize audio context and analyzer
function initAudioContext() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;

    visualizerCanvas = visualizer;
    canvasCtx = visualizerCanvas.getContext('2d');

    visualizerCanvas.width = visualizer.offsetWidth;
    visualizerCanvas.height = visualizer.offsetHeight;
}

// Draw audio visualization
function drawVisualizer(dataArray) {
    const bufferLength = analyser.frequencyBinCount;
    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;

    canvasCtx.fillStyle = '#f8f9fa';
    canvasCtx.fillRect(0, 0, width, height);

    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#007bff';
    canvasCtx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();

    animationFrame = requestAnimationFrame(() => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);
        drawVisualizer(dataArray);
    });
}

// Update timer display
function updateTimer() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timer.textContent = `${minutes}:${seconds}`;
}

// Start recording
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        if (!audioContext) {
            initAudioContext();
        }

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            cancelAnimationFrame(animationFrame);
            analyzeButton.disabled = false;
        };

        mediaRecorder.start();
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);

        recordButton.textContent = 'Stop Recording';
        recordButton.classList.add('recording');
        recordingStatus.textContent = 'Recording in progress...';

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);
        drawVisualizer(dataArray);

        if (!recognition) {
            recognition = new webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onstart = () => {
                isRecognizing = true;
                recordingStatus.textContent = 'Speech recognition started...';
            };

            recognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                result.textContent = transcript;
            };

            recognition.onend = () => {
                isRecognizing = false;
                recordingStatus.textContent = 'Speech recognition ended.';
                analyzeButton.disabled = false;
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
            };
        }

        recognition.start();
    } catch (err) {
        console.error('Error starting recording:', err);
        recordingStatus.textContent = `Error: ${err.message}`;
    }
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        recognition.stop();
        clearInterval(timerInterval);
        recordButton.textContent = 'Start Recording';
        recordButton.classList.remove('recording');
        recordingStatus.textContent = 'Recording stopped';
    }
}

// Reset everything
function resetRecording() {
    stopRecording();
    audioChunks = [];
    timer.textContent = '00:00';
    recordButton.textContent = 'Start Recording';
    recordButton.classList.remove('recording');
    recordingStatus.textContent = 'Ready to record';
    analyzeButton.disabled = true;
    result.textContent = '';

    if (canvasCtx) {
        canvasCtx.clearRect(0, 0, visualizer.width, visualizer.height);
    }
}

// Event listeners
recordButton.addEventListener('click', () => {
    if (mediaRecorder?.state === 'recording') {
        stopRecording();
    } else {
        startRecording();
    }
});

resetButton.addEventListener('click', resetRecording);

analyzeButton.addEventListener('click', async () => {
    const transcript = result.textContent.trim();
    if (transcript) {
        result.textContent = 'Processing transcription...';

        try {
            const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${G_API}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Job Description: ${jobDescInput.value}\n\nTranscript: ${transcript}
                            Give output in this way in below steps with numbers for each:
                            1. Transcription summary
                            2. Recruiter relevancy to question he is supposed to ask with job description
                            3. Recruiter feedback
                            4. Student relevancy to answers he answered to questions asked by recruiter
                            5. Student feedback
                            6. Interview conclusion
                            (give everything in plain text no bold or slant no heading just plain text)`
                        }]
                    }]
                })
            });

            const geminiResult = await geminiResponse.json();
            const analysis = geminiResult.candidates[0].content.parts[0].text;

            const sections = analysis.split(/\d+\./).filter(section => section.trim());

            const transcriptSummary = sections[0] || "No summary provided.";
        const recruiterRelevancy = sections[1] || "No recruiter relevancy provided.";
        const recruiterFeedback = sections[2] || "No recruiter feedback provided.";
        const studentRelevancy = sections[3] || "No student relevancy provided.";
        const studentFeedback = sections[4] || "No student feedback provided.";
        const interviewConclusion = sections[5] || "No conclusion provided.";
        const StudentProbaility = sections[6] || "No probability provided.";
        // Clear the result div and render each section dynamically
        result.innerHTML = `
    <h3>Analysis:</h3>

    <!-- Transcript Summary -->
    <div class="analysis-block transcript-summary">
        <h4>Transcript Summary</h4>
        <p>${transcriptSummary.trim()}</p>
    </div>

    <!-- Recruiter Feedback Section -->
    <div class="feedback-grid">
        <div class="analysis-block feedback-block recruiter-relevancy">
            <h4>Recruiter Relevancy</h4>
            
            <p>${recruiterRelevancy.trim()}</p>
        </div>
        <div class="analysis-block feedback-block recruiter-feedback">
            <h4>Recruiter Feedback</h4>
            <p>${recruiterFeedback.trim()}</p>
        </div>
    </div>

    <!-- Student Feedback Section -->
    <div class="feedback-grid">
        <div class="analysis-block feedback-block student-relevancy">
            <h4>Student Relevancy</h4>
            <p>${studentRelevancy.trim()}</p>
        </div>
        <div class="analysis-block feedback-block student-feedback">
            <h4>Student Feedback</h4>
            <p>${studentFeedback.trim()}</p>
        </div>
    </div>
    
    <!-- Student probability -->
    <div class="analysis-block interview-conclusion">
        <h4>Student selection probability</h4>
        <p>${StudentProbaility.trim()}</p>
    </div>

    <!-- Interview Conclusion -->
    <div class="analysis-block interview-conclusion">
        <h4>Interview Conclusion</h4>
        <p>${interviewConclusion.trim()}</p>
    </div>
            `;
        } catch (error) {
            result.textContent = `Error during analysis: ${error.message}`;
        }
    }
});
