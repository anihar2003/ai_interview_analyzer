const G_API = 'AIzaSyBaVRAhmgszP27nG1NsYgPAuG7Xq41_w5s';
const ASSEMBLY_API_KEY = '45bc790927b94a5eb75e4f81dc64d558';

const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('file-input');
const fileSelect = document.getElementById('file-select');
const submitBtn = document.getElementById('submit-btn');
const jobDescInput = document.getElementById('job-desc');
const resultDiv = document.getElementById('result');
const audioPlayerContainer = document.getElementById('audio-player-container');
const audioPlayer = document.getElementById('audio-player');
const spinner = document.getElementById('loading-spinner');
let uploadedFile = null;

// Drag and Drop Event Listeners
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
});

dropArea.addEventListener('drop', handleDrop, false);
fileSelect.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight() {
    dropArea.classList.add('highlight');
}

function unhighlight() {
    dropArea.classList.remove('highlight');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    handleFiles(files);
}

function handleFiles(files) {
    if (files.length > 0) {
        uploadedFile = files[0];
        dropArea.querySelector('p').textContent = `Selected: ${uploadedFile.name}`;
        
        // Create object URL and set audio player source
        const audioURL = URL.createObjectURL(uploadedFile);
        audioPlayer.src = audioURL;
        audioPlayerContainer.style.display = 'block';
    }
}

// Extract and display Gemini response in custom blocks
submitBtn.addEventListener('click', async () => {
    spinner.style.display = 'block';
    if (!uploadedFile) {
        alert('Please upload an audio file first');
        return;
    }

    try {
        resultDiv.innerHTML = '<p>Processing... Please wait</p>';

        // Upload to AssemblyAI
        const formData = new FormData();
        formData.append('audio', uploadedFile);

        const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
            method: 'POST',
            headers: {
                'Authorization': ASSEMBLY_API_KEY
            },
            body: formData
        });

        const uploadResult = await uploadResponse.json();
        const audioUrl = uploadResult.upload_url;

        // Transcribe
        const transcribeResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST',
            headers: {
                'Authorization': ASSEMBLY_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio_url: audioUrl,
                speaker_labels: true
            })
        });

        const transcriptResult = await transcribeResponse.json();
        const transcriptId = transcriptResult.id;

        // Poll for transcription completion
        let transcriptData;
        while (true) {
            const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
                headers: {
                    'Authorization': ASSEMBLY_API_KEY
                }
            });
            transcriptData = await pollResponse.json();
            if (transcriptData.status === 'completed') break;
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Gemini API call
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${G_API}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Job Description: ${jobDescInput.value}\n\nTranscript: ${transcriptData.text}
                        Give output in this way in below steps with numbers for each:
                        1. Transcription summary
                        2. Recruiter relevancy to question he is supposed to ask with job description and topic in detail
                        3. Recruiter feedback -(it is feedback for the recruiter that which type of questions should be asked and not)
                        4. Student relevancy to answers he answered to questions asked by recruiter in detail
                        5. Student feedback on how he can be improved in detail
                        6. Interview conclusion 
                        7. probability of student getting selected for role. and give "selection percentage" at the end
                        (give everything in plain text no bold or slant no heading just plain text)`
                    }]
                }]
            })
        });
        function getTextAfterColonDash(text) {
            return text.indexOf(": -") !== -1
                ? text.slice(text.indexOf(": -") + 3).trim()
                : text;
        }

        const geminiResult = await geminiResponse.json();
        const analysis = geminiResult.candidates[0].content.parts[0].text;

        // Process the Gemini response into sections
        const sections = analysis.split(/\d+\./).filter(section => section.trim());

        // Assign each section to a variable
        const transcriptSummary = sections[0] || "No summary provided.";
        const recruiterRelevancy = sections[1] || "No recruiter relevancy provided.";
        const recruiterFeedback = sections[2] || "No recruiter feedback provided.";
        const studentRelevancy = sections[3] || "No student relevancy provided.";
        const studentFeedback = sections[4] || "No student feedback provided.";
        const interviewConclusion = sections[5] || "No conclusion provided.";
        const StudentProbaility = sections[6] || "No probability provided.";
        // Clear the result div and render each section dynamically
        resultDiv.innerHTML = `
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
        console.error('Error:', error);
        resultDiv.innerHTML = `<p>Error: ${error.message}</p>`;
    } finally {
        spinner.style.display = 'none'; // Hide spinner
    }
});
