import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, orderBy, writeBatch, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const sections = {
    overview: document.getElementById('sectionOverview'),
    assignments: document.getElementById('sectionAssignments'),
    exams: document.getElementById('sectionExams'),
    attendance: document.getElementById('sectionAttendance'),
    manualattendance: document.getElementById('sectionManualattendance'),
    grades: document.getElementById('sectionGrades'),
    studentmaster: document.getElementById('sectionStudentMaster'),
    notices: document.getElementById('sectionNotices'),
    leaves: document.getElementById('sectionLeaves')
};

const userNameEl   = document.getElementById('userName');
const userAvatarEl  = document.getElementById('userAvatar');
const headerName   = document.getElementById('headerName');
const headerAvatar = document.getElementById('headerAvatar');
const logoutBtn    = document.getElementById('logoutBtn');
const marksTableBody = document.getElementById('marksTableBody');
const examSelector = document.getElementById('examSelector');

let currentTeacher = null;
let currentExamData = null;

// Auth State with Real-time Doc Monitoring
let userUnsub = null;

onAuthStateChanged(auth, async (user) => {
    if (userUnsub) userUnsub(); // Cleanup previous listener

    if (user) {
        // Real-time listener for the user document
        userUnsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if (docSnap.exists() && docSnap.data().role === 'teacher') {
                currentTeacher = docSnap.data();
                currentTeacher.uid = user.uid;
                const displayName = currentTeacher.name || user.email;
                const initial = displayName.charAt(0).toUpperCase();
                if (userNameEl)   userNameEl.textContent   = displayName;
                if (userAvatarEl) userAvatarEl.textContent  = initial;
                if (headerName)   headerName.textContent    = displayName;
                if (headerAvatar) headerAvatar.textContent  = initial;
                
                const navManual = document.getElementById('navManualAttendance');
                if (currentTeacher.isClassTeacher) {
                    navManual.classList.remove('disabled');
                    navManual.title = `Class Teacher for ${currentTeacher.assignedClass}-${currentTeacher.assignedSection}`;
                } else {
                    navManual.classList.add('disabled');
                    navManual.title = "Principal must assign you to a class first";
                }

                // If currently viewing manual attendance and revoked, kick back to overview
                if (!currentTeacher.isClassTeacher && sections.manualattendance.style.display === 'block') {
                    alert("Your Class Teacher responsibilities have been revoked or changed.");
                    switchSection('overview');
                }

            } else if (docSnap.exists() && docSnap.data().role !== 'teacher') {
                window.location.href = 'index.html';
            }
        });

        initTeacherDashboard();
    } else { 
        window.location.href = 'index.html'; 
    }
});

function initTeacherDashboard() {
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.id.replace('nav', '').toLowerCase();
            switchSection(target);
        });
    });

    // Exams/Marks listeners
    examSelector.addEventListener('change', handleExamSelect);
    document.getElementById('saveMarksBtn').addEventListener('click', saveAllMarks);

    // Leaves listeners
    document.getElementById('requestLeaveBtn').addEventListener('click', () => openModal('leaveModal'));
    document.getElementById('closeLeaveModal').addEventListener('click', () => closeModal('leaveModal'));
    document.getElementById('closeLeaveModalBtn').addEventListener('click', () => closeModal('leaveModal'));
    document.getElementById('submitLeaveBtn').addEventListener('click', () => document.getElementById('leaveForm').dispatchEvent(new Event('submit')));
    document.getElementById('leaveForm').addEventListener('submit', handleLeaveSubmit);

    // Assignments
    document.getElementById('newAssignmentBtn').addEventListener('click', () => openModal('assignmentModal'));
    document.getElementById('closeAssignModal').addEventListener('click', () => closeModal('assignmentModal'));
    document.getElementById('assignmentForm').addEventListener('submit', handleAssignmentSubmit);
    document.getElementById('editStudentForm').addEventListener('submit', handleEditStudentUpdate);

    // Attendance listeners
    document.getElementById('startScannerBtn').addEventListener('click', startQRScanner);
    document.getElementById('stopScannerBtn').addEventListener('click', stopQRScanner);
    document.getElementById('submitManualAttBtn').addEventListener('click', saveManualAttendance);
    
    document.getElementById('selectAllAtt').addEventListener('click', () => {
        const checks = document.querySelectorAll('.att-checkbox');
        const allChecked = Array.from(checks).every(c => c.checked);
        checks.forEach(c => c.checked = !allChecked);
    });

    fetchStats();
    populateAssignmentDropdowns();
    window.fetchNotices();
}

const sectionLabels = {
    overview:'Overview', assignments:'Assignments', exams:'Marks Entry',
    attendance:'QR Scanner', manualattendance:'Class Attendance',
    grades:'Gradebook', studentmaster:'Student Directory', leaves:'My Leaves'
};

window.switchSection = (target) => {
    Object.values(sections).forEach(s => { if(s) s.style.display = 'none'; });
    if(sections[target]) sections[target].style.display = 'block';

    navItems.forEach(n => n.classList.remove('active'));
    const navId = `nav${target.charAt(0).toUpperCase() + target.slice(1)}`;
    if(document.getElementById(navId)) document.getElementById(navId).classList.add('active');

    const bc = document.getElementById('breadcrumbCurr');
    if(bc) bc.textContent = sectionLabels[target] || target;

    if (target === 'overview') {
        const dateEl = document.getElementById('currentDate');
        if(dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
        fetchStats();
    }
    if (target === 'exams') populateExamList();
    if (target === 'manualattendance') fetchManualAttendanceSheet();
    if (target === 'assignments') fetchAssignments();
    if (target === 'studentmaster') { window.populateStudentMasterFilters(); window.fetchStudentMaster(); }
    if (target === 'grades') { populateGradeFilters(); fetchGradebook(); }
    if (target === 'leaves') fetchLeaveHistory();
    if (target === 'notices') window.fetchNotices();
};

async function fetchStats() {
    const students = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
    const assigns  = await getDocs(query(collection(db, "assignments"), where("teacherId", "==", currentTeacher ? currentTeacher.uid : "")));
    const dateEl   = document.getElementById('currentDate');
    if(dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
    if(document.getElementById('teacherStudentCount')) document.getElementById('teacherStudentCount').textContent = students.size;
    if(document.getElementById('assignmentCount'))     document.getElementById('assignmentCount').textContent = assigns.size;
}

// Toggle attendance button present/absent
window.toggleAttBtn = (span) => {
    const checkbox = span.closest('label').querySelector('.att-checkbox');
    if (span.classList.contains('present')) {
        span.classList.replace('present', 'absent');
        span.innerHTML = '<i class="fa-solid fa-xmark"></i> Absent';
        if (checkbox) checkbox.checked = false;
    } else {
        span.classList.replace('absent', 'present');
        span.innerHTML = '<i class="fa-solid fa-check"></i> Present';
        if (checkbox) checkbox.checked = true;
    }
};

async function fetchManualAttendanceSheet() {
    if (!currentTeacher.isClassTeacher) {
        alert("You are not assigned as a Class Teacher yet. Please contact the Principal.");
        switchSection('overview');
        return;
    }

    document.getElementById('attDateLabel').textContent = `Date: ${new Date().toLocaleDateString()}`;
    document.getElementById('attClassInfo').textContent = `Class: ${currentTeacher.assignedClass} - ${currentTeacher.assignedSection}`;
    document.getElementById('attSheetTitle').textContent = `Daily Attendance Register`;

    const q = query(
        collection(db, "users"), 
        where("role", "==", "student"), 
        where("class", "==", currentTeacher.assignedClass),
        where("section", "==", currentTeacher.assignedSection)
    );
    const snapshot = await getDocs(q);
    const list = document.getElementById('manualAttendanceBody');
    list.innerHTML = '';

    let rowNum = 1;
    snapshot.forEach(d => {
        const u = d.data();
        list.innerHTML += `
            <tr>
                <td style="color:var(--text-muted);font-weight:700">${rowNum++}</td>
                <td><strong>${u.name}</strong></td>
                <td>
                  <div class="att-radio">
                    <label style="cursor:pointer">
                      <input type="checkbox" class="att-checkbox" data-uid="${d.id}" data-name="${u.name}" checked style="display:none">
                      <span class="att-btn present" onclick="toggleAttBtn(this)"><i class="fa-solid fa-check"></i> Present</span>
                    </label>
                  </div>
                </td>
                <td>
                    <button class="btn btn-secondary btn-sm" 
                            onclick="window.openWhatsAppForStudent('${d.id}')" 
                            title="Send WhatsApp Alert"
                            style="color: #25D366; border-color: #25D366; background: #f0fff4;">
                        <i class="fa-brands fa-whatsapp"></i> Send Alert
                    </button>
                </td>
            </tr>
        `;
    });
}

async function saveManualAttendance() {
    const btn = document.getElementById('submitManualAttBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const batch = writeBatch(db);
    const checks = document.querySelectorAll('.att-checkbox');
    const today = new Date().toISOString().split('T')[0];

    // Fetch messaging settings
    let autoSMS = false;
    try {
        const setSnap = await getDoc(doc(db, "settings", "system"));
        if (setSnap.exists()) autoSMS = setSnap.data().autoAbsenceSms;
    } catch(e) { console.error("Settings error:", e); }

    const absenceList = [];

    checks.forEach(check => {
        const uid = check.dataset.uid;
        const name = check.dataset.name;
        const status = check.checked ? 'present' : 'absent';

        const attRef = doc(collection(db, "attendance"));
        batch.set(attRef, {
            studentId: uid,
            studentName: name,
            date: today,
            status: status,
            teacherId: currentTeacher.uid,
            teacherName: currentTeacher.name,
            timestamp: serverTimestamp()
        });

        if (status === 'absent') {
            absenceList.push({ uid, name });
        }
    });

    try {
        await batch.commit();
        
        // Handle Automated SMS if enabled
        if (autoSMS && absenceList.length > 0) {
            console.log("Triggering automated absence alerts...");
            for (const student of absenceList) {
                await sendAbsenceSMS(student);
            }
            alert(`Attendance Saved! ${absenceList.length} students are absent. You can now send WhatsApp alerts from the Logs or use the prompt below.`);
            
            if (confirm(`Do you want to open WhatsApp to send alerts to the ${absenceList.length} absent students now?`)) {
                for (const student of absenceList) {
                    await window.openWhatsAppForStudent(student.uid);
                }
            }
        } else {
            alert("Daily Attendance Saved Successfully!");
        }
        switchSection('overview');
    } catch (err) { alert("Error: " + err.message); }
    finally { btn.disabled = false; btn.textContent = 'Save Daily Attendance'; }
}

window.openWhatsAppForStudent = async function(studentUid) {
    try {
        const sDoc = await getDoc(doc(db, "users", studentUid));
        if (!sDoc.exists()) return;
        const sData = sDoc.data();
        const phone = sData.contact;
        if (!phone) return;

        const message = `Dear Parent, your ward ${sData.name} is marked ABSENT today (${new Date().toLocaleDateString()}). Please contact the school office. - St. Joseph's School`;
        
        // Clean phone number
        const cleanPhone = phone.replace(/\D/g, '');
        const finalPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
        
        const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    } catch (e) { console.error(e); }
}

async function sendAbsenceSMS(student) {
    try {
        // Fetch student contact info
        const sDoc = await getDoc(doc(db, "users", student.uid));
        if (!sDoc.exists()) return;
        const sData = sDoc.data();
        const parentPhone = sData.contact; // Admission field was 'contact'
        if (!parentPhone) return;

        // Fetch Master Number
        const setSnap = await getDoc(doc(db, "settings", "system"));
        const masterPhone = setSnap.exists() ? setSnap.data().masterPhone : "SYSTEM";

        const message = `Dear Parent, your ward ${student.name} is marked ABSENT today (${new Date().toLocaleDateString()}). Please contact the school office for any queries. - St. Joseph's School`;

        // Log the message (Mocking the actual SMS API call)
        await addDoc(collection(db, "messages"), {
            recipientId: student.uid,
            recipientName: student.name,
            recipientPhone: parentPhone,
            senderPhone: masterPhone,
            message: message,
            type: 'absence_alert',
            status: 'sent',
            timestamp: serverTimestamp()
        });

        console.log(`SMS Sent to ${parentPhone}: ${message}`);
    } catch (e) {
        console.error("Failed to send SMS for", student.name, e);
    }
}

// --- QR SCANNER LOGIC ---
let html5QrCode = null;

async function startQRScanner() {
    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    try {
        await html5QrCode.start(
            { facingMode: "environment" }, 
            config, 
            onScanSuccess
        );
        document.getElementById('startScannerBtn').style.display = 'none';
        document.getElementById('stopScannerBtn').style.display = 'inline-block';
    } catch (err) { alert("Camera Error: " + err); }
}

async function stopQRScanner() {
    if (html5QrCode) {
        await html5QrCode.stop();
        document.getElementById('startScannerBtn').style.display = 'inline-block';
        document.getElementById('stopScannerBtn').style.display = 'none';
    }
}

async function onScanSuccess(decodedText) {
    // decodedText should be the student's UID
    console.log("Scanned UID:", decodedText);
    
    try {
        const studentDoc = await getDoc(doc(db, "users", decodedText));
        if (studentDoc.exists() && studentDoc.data().role === 'student') {
            const sData = studentDoc.data();
            const today = new Date().toISOString().split('T')[0];
            
            // Mark Attendance
            await addDoc(collection(db, "attendance"), {
                studentId: decodedText,
                studentName: sData.name,
                date: today,
                status: 'present',
                teacherId: currentTeacher.uid,
                timestamp: serverTimestamp()
            });

            // Show Result UI
            const resultEl = document.getElementById('scanResult');
            document.getElementById('scannedStudentName').textContent = sData.name;
            resultEl.style.display = 'block';
            
            // Audio Feedback (Optional but professional)
            const beep = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            beep.play();

            // Hide result after 3 seconds
            setTimeout(() => { resultEl.style.display = 'none'; }, 3000);

        } else {
            alert("Invalid QR Code: No student found.");
        }
    } catch (err) { console.error("Scan processing error:", err); }
}

// --- MARKS ENTRY LOGIC ---
async function populateExamList() {
    const snapshot = await getDocs(query(collection(db, "exams"), orderBy("date", "desc")));
    examSelector.innerHTML = '<option value="">Select Scheduled Exam</option>';
    snapshot.forEach(d => {
        const ex = d.data();
        examSelector.innerHTML += `<option value="${d.id}">${ex.subject} (${ex.class}) - ${ex.date}</option>`;
    });
}

async function handleExamSelect(e) {
    const examId = e.target.value;
    if (!examId) {
        document.getElementById('marksEntryContainer').style.display = 'none';
        document.getElementById('noExamSelected').style.display = 'block';
        return;
    }

    const examDoc = await getDoc(doc(db, "exams", examId));
    currentExamData = { id: examId, ...examDoc.data() };

    document.getElementById('selectedExamTitle').textContent = `${currentExamData.subject} Examination - ${currentExamData.class}`;
    document.getElementById('maxMarksLabel').textContent = `Target: ${currentExamData.maxMarks} Marks`;
    document.getElementById('globalTotalMarks').value = currentExamData.maxMarks || 100;
    document.getElementById('marksEntryContainer').style.display = 'block';
    document.getElementById('noExamSelected').style.display = 'none';

    fetchStudentsForMarks(currentExamData.class);
}

async function fetchStudentsForMarks(className) {
    // 1. Check for existing marks for this exam
    const marksQuery = query(collection(db, "marks"), where("examId", "==", currentExamData.id));
    const marksSnap = await getDocs(marksQuery);
    const existingMarks = {};
    marksSnap.forEach(d => { existingMarks[d.data().studentId] = d.data(); });

    const isPublished = !marksSnap.empty;
    const saveBtn = document.getElementById('saveMarksBtn');
    
    if (isPublished) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Marks Already Published';
        saveBtn.style.background = 'var(--success)';
    } else {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Finalize & Submit';
        saveBtn.style.background = '';
    }

    const q = query(collection(db, "users"), where("role", "==", "student"), where("class", "==", className));
    const snapshot = await getDocs(q);
    
    marksTableBody.innerHTML = '';
    let count = 1;
    snapshot.forEach(d => {
        const u = d.data();
        const existing = existingMarks[d.id];
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${count++}</td>
            <td><strong>${u.name}</strong></td>
            <td><span class="badge badge-neutral">${u.studentID || u.email}</span></td>
            <td>
                <input type="number" class="marks-input" data-uid="${d.id}" 
                placeholder="0" min="0" 
                value="${existing ? existing.marksObtained : ''}"
                ${existing ? 'disabled' : ''} 
                oninput="window.calculateGrade(this)">
            </td>
            <td class="perc-cell" style="font-weight:700; color:${existing ? 'var(--text-muted)' : 'var(--brand-600)'}">${existing ? existing.percentage + '%' : '0%'}</td>
            <td class="grade-cell">
                ${existing 
                    ? `<span class="grade-pill grade-${existing.grade === 'A+' ? 'A-plus' : existing.grade}">${existing.grade}</span>`
                    : '<span class="grade-pill grade-D">N/A</span>'}
            </td>
        `;
        marksTableBody.appendChild(row);
    });
}

window.calculateGrade = (input) => {
    const marks = parseFloat(input.value) || 0;
    const totalInput = document.getElementById('globalTotalMarks');
    const maxMarks = parseFloat(totalInput ? totalInput.value : 100) || 100;
    
    const perc = ((marks / maxMarks) * 100).toFixed(1);
    const row = input.closest('tr');
    const percEl = row.querySelector('.perc-cell');
    percEl.textContent = `${perc}%`;
    
    // Visual feedback for over-marks
    if (marks > maxMarks) percEl.style.color = 'var(--danger)';
    else percEl.style.color = 'var(--brand-600)';

    const gradeCell = row.querySelector('.grade-cell');
    let grade = 'F';
    let gradeClass = 'grade-D';

    if (perc >= 90) { grade = 'A+'; gradeClass = 'grade-A-plus'; }
    else if (perc >= 80) { grade = 'A'; gradeClass = 'grade-A'; }
    else if (perc >= 70) { grade = 'B'; gradeClass = 'grade-B'; }
    else if (perc >= 60) { grade = 'C'; gradeClass = 'grade-C'; }
    else if (perc >= 50) { grade = 'D'; gradeClass = 'grade-D'; }
    else { grade = 'F'; gradeClass = 'grade-D'; }

    gradeCell.innerHTML = `<span class="grade-pill ${gradeClass}">${grade}</span>`;
};

window.recalculateAllMarks = () => {
    const inputs = document.querySelectorAll('.marks-input');
    inputs.forEach(input => window.calculateGrade(input));
};

async function saveAllMarks() {
    const btn = document.getElementById('saveMarksBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const batch = writeBatch(db);
    const inputs = document.querySelectorAll('.marks-input');
    
    inputs.forEach(input => {
        const uid = input.dataset.uid;
        const marks = parseFloat(input.value) || 0;
        const totalMarks = parseFloat(document.getElementById('globalTotalMarks').value) || 100;
        const examType = document.getElementById('marksExamType').value;
        const row = input.closest('tr');
        const grade = row.querySelector('.grade-pill').textContent;
        const perc = row.querySelector('.perc-cell').textContent.replace('%', '');

        const markRef = doc(collection(db, "marks"));
        batch.set(markRef, {
            studentId: uid,
            studentName: row.querySelector('strong').textContent,
            examId: currentExamData.id,
            subject: currentExamData.subject,
            class: currentExamData.class,
            marksObtained: marks,
            maxMarks: totalMarks,
            percentage: parseFloat(perc),
            grade: grade,
            examType: examType,
            examDate: currentExamData.date || "",
            teacherId: currentTeacher.uid,
            timestamp: serverTimestamp()
        });
    });

    try {
        await batch.commit();
        alert("Marks Finalized & Published Successfully!");
        switchSection('overview');
    } catch (err) { alert("Error: " + err.message); }
    finally { btn.disabled = false; btn.textContent = 'Finalize & Submit Marks'; }
}

// --- OTHER MODULES ---
async function handleAssignmentSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('submitAssignBtn');
    const file = document.getElementById('assignFile').files[0];
    btn.disabled = true;

    let fileUrl = "";
    if (file) {
        const sRef = ref(storage, `assignments/${Date.now()}_${file.name}`);
        await uploadBytes(sRef, file);
        fileUrl = await getDownloadURL(sRef);
    }

    await addDoc(collection(db, "assignments"), {
        title: document.getElementById('assignTitle').value,
        subject: document.getElementById('assignSubject').value,
        deadline: document.getElementById('assignDeadline').value,
        class: document.getElementById('assignClass').value,
        section: document.getElementById('assignSection').value,
        fileUrl,
        teacherId: currentTeacher.uid,
        teacherName: currentTeacher.name || "Teacher",
        timestamp: serverTimestamp()
    });

    alert("Assignment Published!");
    e.target.reset();
    closeModal('assignmentModal'); 
    fetchAssignments();
    btn.disabled = false;
}

async function fetchAssignments() {
    const q = query(collection(db, "assignments"), where("teacherId", "==", currentTeacher.uid), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    const list = document.getElementById('assignmentTableBody'); 
    if(!list) return;
    list.innerHTML = '';
    
    snap.forEach(d => {
        const a = d.data();
        list.innerHTML += `
            <tr>
                <td>${a.title}</td>
                <td>${a.subject}</td>
                <td><span class="badge badge-info">${a.class} - ${a.section}</span></td>
                <td>${a.deadline}</td>
                <td>${a.fileUrl ? `<a href="${a.fileUrl}" target="_blank" class="btn btn-secondary btn-sm"><i class="fa-solid fa-file-arrow-down"></i> View</a>` : '<span class="badge badge-neutral">No file</span>'}</td>
                <td><button class="btn btn-secondary btn-sm" onclick="window.deleteDocById('assignments', '${d.id}', fetchAssignments)"><i class="fa-solid fa-trash-can"></i></button></td>
            </tr>`;
    });
}

let assignmentSections = [];
async function populateAssignmentDropdowns() {
    const cSnap = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const sSnap = await getDocs(query(collection(db, "sections"), orderBy("name")));
    assignmentSections = sSnap.docs.map(doc => doc.data());

    const aClass = document.getElementById('assignClass');
    if(aClass) {
        aClass.innerHTML = '<option value="">Select Class</option>';
        cSnap.forEach(d => aClass.innerHTML += `<option value="${d.data().name}">${d.data().name}</option>`);
        aClass.addEventListener('change', (e) => updateAssignmentSections(e.target.value));
    }
}

function updateAssignmentSections(selectedClass) {
    const aSection = document.getElementById('assignSection');
    if(!aSection) return;
    aSection.innerHTML = '<option value="">Select Section</option>';
    assignmentSections.filter(s => s.parentClass === selectedClass).forEach(s => {
        aSection.innerHTML += `<option value="${s.name}">${s.name}</option>`;
    });
}

// --- STUDENT DIRECTORY ---
window.fetchStudentMaster = async function() {
    const searchEl = document.getElementById('stuSearch');
    const filterClassEl = document.getElementById('stuFilterClass');
    const filterSectionEl = document.getElementById('stuFilterSection');

    const search = searchEl ? searchEl.value.toLowerCase() : '';
    const filterClass = filterClassEl ? filterClassEl.value : '';
    const filterSection = filterSectionEl ? filterSectionEl.value : '';

    const snap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
    const list = document.getElementById('studentMasterTableBody'); list.innerHTML = '';
    
    let count = 1;
    snap.forEach(d => {
        const u = d.data();

        // Apply Filters
        const matchesSearch = !search || 
            (u.name && u.name.toLowerCase().includes(search)) || 
            (u.email && u.email.toLowerCase().includes(search)) || 
            (u.studentID && u.studentID.toLowerCase().includes(search));
        
        const matchesClass = !filterClass || u.class === filterClass;
        const matchesSection = !filterSection || u.section === filterSection;

        if (matchesSearch && matchesClass && matchesSection) {
            list.innerHTML += `
                <tr>
                    <td>${count++}</td>
                    <td><span style="font-family:var(--font-mono);font-size:.75rem;font-weight:700;color:var(--brand-600)">${u.studentID || '---'}</span></td>
                    <td><strong>${u.name}</strong></td>
                    <td><span class="badge badge-info">${u.class} - ${u.section}</span></td>
                    <td>${u.email}</td>
                    <td>
                        <div style="display:flex; gap:.4rem">
                            <button class="btn btn-secondary btn-sm" onclick="window.showStudentDetails('${d.id}')" title="View Details"><i class="fa-solid fa-eye"></i></button>
                            <button class="btn btn-primary btn-sm" onclick="window.openEditStudentModal('${d.id}')" title="Edit Student"><i class="fa-solid fa-pencil"></i></button>
                        </div>
                    </td>
                </tr>`;
        }
    });

    if (list.innerHTML === '') {
        list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--text-muted)">No students found matching filters.</td></tr>';
    }
}

window.showStudentDetails = async function(uid) {
    const docSnap = await getDoc(doc(db, "users", uid));
    if (docSnap.exists()) {
        const u = docSnap.data();
        const modal = document.getElementById('studentDetailModal');
        const content = document.getElementById('studentDetailContent');
        if(modal && content) {
            content.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
                    <div class="input-group"><label>Full Name</label><p style="font-weight:600">${u.name}</p></div>
                    <div class="input-group"><label>Student ID</label><p style="font-weight:600;color:var(--brand-600)">${u.studentID || '---'}</p></div>
                    <div class="input-group"><label>Class / Section</label><p>${u.class} - ${u.section}</p></div>
                    <div class="input-group"><label>Email</label><p>${u.email}</p></div>
                    <div class="input-group"><label>Father's Name</label><p>${u.fatherName || '---'}</p></div>
                    <div class="input-group"><label>Mother's Name</label><p>${u.motherName || '---'}</p></div>
                    <div class="input-group"><label>Contact No.</label><p>${u.contact || '---'}</p></div>
                    <div class="input-group" style="grid-column:span 2"><label>Address</label><p>${u.address || '---'}</p></div>
                </div>
            `;
            modal.classList.add('show');
        }
    }
}

window.resetStudentFilters = () => {
    if (document.getElementById('stuSearch')) document.getElementById('stuSearch').value = '';
    if (document.getElementById('stuFilterClass')) document.getElementById('stuFilterClass').value = '';
    if (document.getElementById('stuFilterSection')) document.getElementById('stuFilterSection').value = '';
    window.updateStudentMasterSections();
    window.fetchStudentMaster();
};

let studentMasterSections = []; // Cache for dynamic filtering

window.populateStudentMasterFilters = async function() {
    const cSnap = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const sSnap = await getDocs(query(collection(db, "sections"), orderBy("name")));
    
    studentMasterSections = sSnap.docs.map(doc => doc.data());
    
    const fClass = document.getElementById('stuFilterClass');
    if(fClass) {
        fClass.innerHTML = '<option value="">All Classes</option>';
        cSnap.forEach(d => fClass.innerHTML += `<option value="${d.data().name}">${d.data().name}</option>`);
        
        if (!fClass.dataset.filterListener) {
            fClass.addEventListener('change', () => window.updateStudentMasterSections());
            fClass.dataset.filterListener = "true";
        }
    }
    window.updateStudentMasterSections();
}

window.updateStudentMasterSections = function() {
    const fClass = document.getElementById('stuFilterClass');
    const fSection = document.getElementById('stuFilterSection');
    if(!fSection) return;

    const selectedClass = fClass ? fClass.value : "";
    fSection.innerHTML = '<option value="">All Sections</option>';
    
    const filtered = selectedClass 
        ? studentMasterSections.filter(s => s.parentClass === selectedClass)
        : studentMasterSections;

    filtered.forEach(s => fSection.innerHTML += `<option value="${s.name}">${s.name}</option>`);
    window.fetchStudentMaster();
}

async function populateGradeFilters() {
    const cSnap = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const sSnap = await getDocs(query(collection(db, "sections"), orderBy("name")));
    const fClass = document.getElementById('gradeFilterClass');
    const fSection = document.getElementById('gradeFilterSection');
    if(!fClass || !fSection) return;

    if(fClass.options.length <= 1) {
        cSnap.forEach(d => fClass.innerHTML += `<option value="${d.data().name}">${d.data().name}</option>`);
    }
    
    fClass.onchange = () => {
        fSection.innerHTML = '<option value="">All Sections</option>';
        sSnap.docs.filter(d => d.data().parentClass === fClass.value).forEach(d => fSection.innerHTML += `<option value="${d.data().name}">${d.data().name}</option>`);
        fetchGradebook();
    };
}

async function fetchGradebook() {
    const list = document.getElementById('gradebookTableBody'); 
    if(!list) return;
    
    // Reset selection UI
    const selectAll = document.getElementById('selectAllGrades');
    if(selectAll) selectAll.checked = false;
    const bulkBtn = document.getElementById('bulkDeleteGradesBtn');
    if(bulkBtn) bulkBtn.style.display = 'none';

    const filterClass = document.getElementById('gradeFilterClass').value;
    const filterSection = document.getElementById('gradeFilterSection').value;
    const filterType = document.getElementById('gradeFilterType').value;

    list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Filtering Records...</td></tr>';
    
    try {
        let q = query(collection(db, "marks"), where("teacherId", "==", currentTeacher.uid));
        const snap = await getDocs(q);
        list.innerHTML = '';
        
        let marks = [];
        snap.forEach(d => {
            const data = d.data();
            // Client side filter to avoid complex composite indexes
            const matchesClass = !filterClass || data.class === filterClass;
            const matchesSection = !filterSection || data.section === filterSection;
            const matchesType = !filterType || data.examType === filterType;
            
            if (matchesClass && matchesSection && matchesType) marks.push({ id: d.id, ...data });
        });
        
        if (marks.length === 0) {
            list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--text-muted)">No matching grade records found.</td></tr>';
            return;
        }

        // Sort by timestamp desc
        marks.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

        marks.forEach(m => {
            const date = m.examDate || (m.timestamp ? m.timestamp.toDate().toLocaleDateString() : '---');
            const typeLabel = m.examType ? m.examType.replace('_', ' ').toUpperCase() : 'EXAM';
            list.innerHTML += `
                <tr>
                    <td><input type="checkbox" class="grade-check" value="${m.id}" onclick="window.updateGradeSelection()"></td>
                    <td>
                        <strong>${m.studentName}</strong>
                        <div style="font-size:.65rem; color:var(--text-muted)">${m.class || ''} - ${m.section || ''}</div>
                    </td>
                    <td>
                        <span style="font-weight:600">${m.subject}</span>
                        <div style="font-size:.65rem; color:var(--brand-600); font-weight:700">${typeLabel}</div>
                    </td>
                    <td>${date}</td>
                    <td><span style="font-weight:700">${m.marksObtained}/${m.maxMarks}</span></td>
                    <td style="color:var(--brand-600);font-weight:700">${m.percentage}%</td>
                    <td><span class="grade-pill grade-${m.grade === 'A+' ? 'A-plus' : m.grade}">${m.grade}</span></td>
                </tr>`;
        });
    } catch (err) {
        console.error("Gradebook Error:", err);
        list.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--danger)">Error filtering gradebook: ${err.message}</td></tr>`;
    }
}

window.toggleSelectAllGrades = function(source) {
    document.querySelectorAll('.grade-check').forEach(c => c.checked = source.checked);
    window.updateGradeSelection();
};

window.updateGradeSelection = function() {
    const checked = document.querySelectorAll('.grade-check:checked');
    const bulkBtn = document.getElementById('bulkDeleteGradesBtn');
    const countSpan = document.getElementById('selectedGradesCount');
    
    if (bulkBtn) bulkBtn.style.display = checked.length > 0 ? 'flex' : 'none';
    if (countSpan) countSpan.textContent = checked.length;
};

window.handleBulkDeleteGrades = async function() {
    const checked = document.querySelectorAll('.grade-check:checked');
    if (checked.length === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${checked.length} record(s) from history? This cannot be undone.`)) return;
    
    const bulkBtn = document.getElementById('bulkDeleteGradesBtn');
    const originalText = bulkBtn.innerHTML;
    bulkBtn.disabled = true;
    bulkBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
    
    try {
        const batch = writeBatch(db);
        checked.forEach(c => {
            batch.delete(doc(db, "marks", c.value));
        });
        await batch.commit();
        alert(`${checked.length} records deleted successfully.`);
        fetchGradebook();
    } catch (err) {
        alert("Deletion failed: " + err.message);
    } finally {
        bulkBtn.disabled = false;
        bulkBtn.innerHTML = originalText;
    }
};

async function handleLeaveSubmit(e) {
    e.preventDefault();
    await addDoc(collection(db, "leaves"), {
        teacherId: currentTeacher.uid,
        teacherName: currentTeacher.name,
        startDate: document.getElementById('leaveStart').value,
        endDate: document.getElementById('leaveEnd').value,
        type: document.getElementById('leaveType').value,
        reason: document.getElementById('leaveReason').value,
        status: "pending",
        timestamp: serverTimestamp()
    });
    alert("Leave Application Submitted!"); closeModal('leaveModal'); fetchLeaveHistory();
}

async function fetchLeaveHistory() {
    const q = query(collection(db, "leaves"), where("teacherId", "==", currentTeacher.uid));
    const snap = await getDocs(q);
    const list = document.getElementById('leaveHistoryBody'); list.innerHTML = '';
    snap.forEach(d => {
        const l = d.data();
        list.innerHTML += `<tr><td>${l.startDate} to ${l.endDate}</td><td>${l.type}</td><td>${l.reason}</td><td>${l.status}</td></tr>`;
    });
}

// --- NOTICE BOARD LOGIC ---
window.fetchNotices = async function() {
    const briefList = document.getElementById('noticeBriefList');
    const fullList = document.getElementById('fullNoticeList');
    if (!briefList && !fullList) return;

    try {
        const snap = await getDocs(query(collection(db, "notices"), where("audience", "in", ["all", "teachers"]), orderBy("timestamp", "desc")));
        
        if (briefList) {
            briefList.innerHTML = '';
            if (snap.empty) {
                briefList.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:.8rem">No recent notices.</p>';
            } else {
                snap.docs.slice(0, 3).forEach(d => {
                    const n = d.data();
                    const date = n.timestamp ? n.timestamp.toDate().toLocaleDateString() : 'Just now';
                    briefList.innerHTML += `
                        <div style="padding:.75rem; background:var(--bg-muted); border-radius:var(--r-sm); border-left:3px solid var(--brand-500)">
                            <h4 style="font-size:.85rem; margin-bottom:.15rem">${n.title}</h4>
                            <p style="font-size:.7rem; color:var(--text-muted)">${date}</p>
                        </div>`;
                });
            }
        }

        if (fullList) {
            fullList.innerHTML = '';
            if (snap.empty) {
                fullList.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-bullhorn"></i><h3>No notices found</h3><p>Check back later for school announcements.</p></div>';
            } else {
                snap.forEach(d => {
                    const n = d.data();
                    const date = n.timestamp ? n.timestamp.toDate().toLocaleString() : 'Just now';
                    const fileLink = n.fileUrl ? `<a href="${n.fileUrl}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top:1rem; width:100%"><i class="fa-solid fa-paperclip"></i> View Attachment (${n.fileType.toUpperCase()})</a>` : '';
                    
                    fullList.innerHTML += `
                        <div class="content-card animate-slide-up" style="margin-bottom:0">
                            <div class="card-body">
                                <div style="display:flex; justify-content:space-between; margin-bottom:1rem">
                                    <span class="badge badge-info">${n.audience.toUpperCase()}</span>
                                    <span style="font-size:.75rem; color:var(--text-muted)">${date}</span>
                                </div>
                                <h3 style="font-size:1.1rem; margin-bottom:.75rem; color:var(--brand-700)">${n.title}</h3>
                                <p style="font-size:.9rem; color:var(--text-secondary); white-space:pre-wrap">${n.content || ''}</p>
                                ${fileLink}
                            </div>
                        </div>`;
                });
            }
        }
    } catch (err) {
        console.error("Notice fetch error:", err);
    }
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// --- EDIT STUDENT LOGIC (Shared) ---
window.openEditStudentModal = async function(uid) {
    const docSnap = await getDoc(doc(db, "users", uid));
    if (!docSnap.exists()) return;
    
    const u = docSnap.data();
    document.getElementById('editStuUid').value = uid;
    document.getElementById('editStuName').value = u.name || '';
    document.getElementById('editStuEmail').value = u.email || '';
    document.getElementById('editStuFather').value = u.fatherName || '';
    document.getElementById('editStuMother').value = u.motherName || '';
    document.getElementById('editStuContact').value = u.contact || '';
    document.getElementById('editStuAddress').value = u.address || '';

    const cSnap = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const sSnap = await getDocs(query(collection(db, "sections"), orderBy("name")));
    const allSectionsForEdit = sSnap.docs.map(doc => doc.data());

    const editClass = document.getElementById('editStuClass');
    const editSection = document.getElementById('editStuSection');

    editClass.innerHTML = '<option value="">Select Class</option>';
    cSnap.forEach(d => {
        const name = d.data().name;
        editClass.innerHTML += `<option value="${name}" ${name === u.class ? 'selected' : ''}>${name}</option>`;
    });

    const updateEditSections = (selectedClass) => {
        editSection.innerHTML = '<option value="">Select Section</option>';
        allSectionsForEdit.filter(s => s.parentClass === selectedClass).forEach(s => {
            editSection.innerHTML += `<option value="${s.name}" ${s.name === u.section ? 'selected' : ''}>${s.name}</option>`;
        });
    };

    updateEditSections(u.class);
    editClass.onchange = (e) => updateEditSections(e.target.value);
    document.getElementById('editStudentModal').classList.add('show');
}

async function handleEditStudentUpdate(e) {
    e.preventDefault();
    const uid = document.getElementById('editStuUid').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const data = {
        name: document.getElementById('editStuName').value,
        class: document.getElementById('editStuClass').value,
        section: document.getElementById('editStuSection').value,
        fatherName: document.getElementById('editStuFather').value,
        motherName: document.getElementById('editStuMother').value,
        contact: document.getElementById('editStuContact').value,
        address: document.getElementById('editStuAddress').value,
    };
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    try {
        await updateDoc(doc(db, "users", uid), data);
        alert("Student details updated successfully!");
        document.getElementById('editStudentModal').classList.remove('show');
        window.fetchStudentMaster();
    } catch (err) { alert("Update failed: " + err.message); }
    finally { btn.disabled = false; btn.innerHTML = 'Save Changes'; }
}

// --- PROMOTION LOGIC (Shared) ---
window.openPromoteModal = async function() {
    const cSnap = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const sourceSelect = document.getElementById('promoteSourceClass');
    const targetSelect = document.getElementById('promoteTargetClass');
    sourceSelect.innerHTML = '<option value="">Select Class</option>';
    targetSelect.innerHTML = '<option value="">Select Target Class</option>';
    cSnap.forEach(d => {
        const name = d.data().name;
        sourceSelect.innerHTML += `<option value="${name}">${name}</option>`;
        targetSelect.innerHTML += `<option value="${name}">${name}</option>`;
    });
    document.getElementById('promoteStudentListBody').innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted)">Select a source class to view students.</td></tr>';
    document.getElementById('selectAllPromote').checked = false;
    document.getElementById('promoteCount').textContent = '0 Students Selected';
    document.getElementById('promoteModal').classList.add('show');
}

window.fetchPromoteStudentList = async function() {
    const sourceClass = document.getElementById('promoteSourceClass').value;
    const listBody = document.getElementById('promoteStudentListBody');
    if (!sourceClass) {
        listBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted)">Select a source class to view students.</td></tr>';
        return;
    }
    listBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';
    const snapshot = await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("class", "==", sourceClass)));
    listBody.innerHTML = '';
    document.getElementById('selectAllPromote').checked = false;
    window.updatePromoteCount();
    if (snapshot.empty) {
        listBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted)">No students found.</td></tr>';
        return;
    }
    snapshot.forEach(d => {
        const u = d.data();
        listBody.innerHTML += `<tr><td><input type="checkbox" class="promote-check" value="${d.id}" onchange="window.updatePromoteCount()"></td><td><span style="font-family:var(--font-mono); font-weight:700">${u.studentID || '---'}</span></td><td>${u.name}</td><td><span class="badge badge-info">${u.section}</span></td></tr>`;
    });
}

window.toggleSelectAllPromote = function(source) {
    document.querySelectorAll('.promote-check').forEach(c => c.checked = source.checked);
    window.updatePromoteCount();
}

window.updatePromoteCount = function() {
    const count = document.querySelectorAll('.promote-check:checked').length;
    document.getElementById('promoteCount').textContent = `${count} Students Selected`;
}

window.handleBulkPromotion = async function() {
    const targetClass = document.getElementById('promoteTargetClass').value;
    const selectedStudents = Array.from(document.querySelectorAll('.promote-check:checked')).map(c => c.value);
    if (!targetClass || selectedStudents.length === 0) { alert("Please select target class and students."); return; }
    if (!confirm(`Promote ${selectedStudents.length} students to ${targetClass}?`)) return;
    const btn = document.getElementById('confirmPromoteBtn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Promoting...`;
    try {
        for (const uid of selectedStudents) { await updateDoc(doc(db, "users", uid), { class: targetClass }); }
        alert("Promotion Successful!");
        document.getElementById('promoteModal').classList.remove('show');
        window.fetchStudentMaster();
    } catch (err) { alert("Error: " + err.message); }
    finally { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-arrow-up-right-dots"></i> Promote Selected`; }
}

logoutBtn.addEventListener('click', () => signOut(auth).then(() => window.location.href = 'index.html'));
