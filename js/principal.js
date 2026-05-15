import { auth, db, storage } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, deleteDoc, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// Secondary App Initialization for creating students without logging out Principal
const secondaryConfig = {
  apiKey: "AIzaSyAi4CrcwRIHSlPlcQ5gOZss5eSADJ4KNaA",
  authDomain: "school-erp-b0953.firebaseapp.com",
  projectId: "school-erp-b0953",
  storageBucket: "school-erp-b0953.firebasestorage.app",
  messagingSenderId: "432478869827",
  appId: "1:432478869827:web:d8acf0dab4a067662df7f6"
};
const secondaryApp = initializeApp(secondaryConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const sections = {
    overview: document.getElementById('sectionOverview'),
    admission: document.getElementById('sectionAdmission'),
    studentmaster: document.getElementById('sectionStudentMaster'),
    classes: document.getElementById('sectionClasses'),
    exams: document.getElementById('sectionExams'),
    timetable: document.getElementById('sectionTimetable'),
    allocation: document.getElementById('sectionAllocation'),
    fees: document.getElementById('sectionFees'),
    transport: document.getElementById('sectionTransport'),
    notices: document.getElementById('sectionNotices'),
    staffleaves: document.getElementById('sectionStaffLeaves'),
    users: document.getElementById('sectionUsers'),
    settings: document.getElementById('sectionSettings')
};

const userNameEl   = document.getElementById('userName');
const userAvatarEl  = document.getElementById('userAvatar');
const headerName   = document.getElementById('headerName');
const headerAvatar = document.getElementById('headerAvatar');
const logoutBtn    = document.getElementById('logoutBtn');

// Auth Check
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === 'principal') {
            const data = userDoc.data();
            const displayName = data.name || user.email;
            const initial = displayName.charAt(0).toUpperCase();
            if (userNameEl)   userNameEl.textContent   = displayName;
            if (userAvatarEl) userAvatarEl.textContent  = initial;
            if (headerName)   headerName.textContent    = displayName;
            if (headerAvatar) headerAvatar.textContent  = initial;
            initDashboard();
        } else { window.location.href = 'index.html'; }
    } else { window.location.href = 'index.html'; }
});

function initDashboard() {
    updateDate();
    fetchAllStats();
    
    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.id.replace('nav', '').toLowerCase();
            switchSection(target);
        });
    });

    // Form Submissions
    document.getElementById('classForm').addEventListener('submit', handleClassAdd);
    document.getElementById('sectionForm').addEventListener('submit', handleSectionAdd);
    document.getElementById('examForm').addEventListener('submit', handleExamSchedule);
    document.getElementById('ttForm').addEventListener('submit', handleTimetableAssign);
    document.getElementById('doAllocateBtn').addEventListener('click', handleCTAllocation);
    document.getElementById('admissionForm').addEventListener('submit', handleAdmission);
    document.getElementById('staffForm').addEventListener('submit', handleStaffAdd);
    document.getElementById('editStudentForm').addEventListener('submit', handleEditStudentUpdate);
    document.getElementById('noticeForm').addEventListener('submit', handleNoticeSubmit);
    document.getElementById('settingsForm').addEventListener('submit', handleSettingsSave);

    // Filter
    document.getElementById('ttViewFilter').addEventListener('change', (e) => renderTimetableGrid(e.target.value));

    // Auto-generate ID on section load
    generateStudentID();
}

window.generateStudentID = () => {
    const prefix = "STU";
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    const generatedID = `${prefix}${year}${random}`;
    const uidInput = document.getElementById('admUID');
    if(uidInput) uidInput.value = generatedID;
};

function updateDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateEl = document.getElementById('currentDate');
    if(dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', options);
}

const sectionLabels = {
    overview:'Dashboard', admission:'Admission Form', studentmaster:'Student Master',
    classes:'Class & Section', exams:'Examination', timetable:'Timetable Master',
    allocation:'CT Allocation', notices:'Notice Board', fees:'Fee Management', transport:'Transport', users:'User Master', settings:'System Settings'
};

window.switchSection = (target) => {
    Object.values(sections).forEach(s => { if(s) s.style.display = 'none'; });
    if(sections[target]) sections[target].style.display = 'block';

    navItems.forEach(n => n.classList.remove('active'));
    let foundNav = null;
    navItems.forEach(item => {
        if (item.id.toLowerCase() === `nav${target.toLowerCase()}`) foundNav = item;
    });
    if(foundNav) foundNav.classList.add('active');

    const bc = document.getElementById('breadcrumbCurr');
    if(bc) bc.textContent = sectionLabels[target] || target;

    if (target === 'overview') fetchAllStats();
    if (target === 'studentmaster') { window.populateStudentMasterFilters(); window.fetchStudentMaster(); }
    if (target === 'classes') { fetchClasses(); fetchSections(); }
    if (target === 'exams') fetchExams();
    if (target === 'timetable') populateTimetableDropdowns();
    if (target === 'allocation') populateAllocationDropdowns();
    if (target === 'admission') populateAdmissionDropdowns();
    if (target === 'transport') fetchTransport();
    if (target === 'fees') fetchFeeData();
    if (target === 'staffleaves') fetchStaffLeaves();
    if (target === 'notices') window.fetchNotices();
    if (target === 'users') window.fetchStaffList();
    if (target === 'settings') { fetchSettings(); fetchMessageLogs(); }
};

async function fetchAllStats() {
    const students = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
    const teachers = await getDocs(query(collection(db, "users"), where("role", "==", "teacher")));
    if(document.getElementById('totalStudentsCount')) document.getElementById('totalStudentsCount').textContent = students.size;
    if(document.getElementById('totalTeachersCount')) document.getElementById('totalTeachersCount').textContent = teachers.size;
    if(document.getElementById('totalRevenue')) document.getElementById('totalRevenue').textContent = `₹${(students.size * 48000).toLocaleString('en-IN')}`;
}

// --- TIMETABLE MASTER ---
async function populateTimetableDropdowns() {
    const classSnapshot = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const teacherSnapshot = await getDocs(query(collection(db, "users"), where("role", "==", "teacher")));
    
    const ttClass = document.getElementById('ttClass');
    const ttTeacher = document.getElementById('ttTeacher');
    const ttViewFilter = document.getElementById('ttViewFilter');
    
    ttClass.innerHTML = '<option value="">Select Class</option>';
    ttViewFilter.innerHTML = '<option value="">All Classes</option>';
    classSnapshot.forEach(d => {
        const name = d.data().name;
        ttClass.innerHTML += `<option value="${name}">${name}</option>`;
        ttViewFilter.innerHTML += `<option value="${name}">${name}</option>`;
    });

    ttTeacher.innerHTML = '<option value="">Select Teacher</option>';
    teacherSnapshot.forEach(d => {
        ttTeacher.innerHTML += `<option value="${d.id}">${d.data().name}</option>`;
    });

    renderTimetableGrid();
}

async function handleTimetableAssign(e) {
    e.preventDefault();
    const day = document.getElementById('ttDay').value;
    const className = document.getElementById('ttClass').value;
    const teacherId = document.getElementById('ttTeacher').value;
    const slot = document.getElementById('ttSlot').value;
    const subject = document.getElementById('ttSubject').value;

    const teacherDoc = await getDoc(doc(db, "users", teacherId));
    const teacherName = teacherDoc.data().name;

    // --- CONFLICT DETECTION ---
    const qTeacher = query(collection(db, "timetable"), where("day", "==", day), where("slot", "==", slot), where("teacherId", "==", teacherId));
    const teacherBusy = await getDocs(qTeacher);
    if (!teacherBusy.empty) {
        alert(`CONFLICT DETECTED: Teacher ${teacherName} is already assigned to Class ${teacherBusy.docs[0].data().class} during this period!`);
        return;
    }

    const qClass = query(collection(db, "timetable"), where("day", "==", day), where("slot", "==", slot), where("class", "==", className));
    const classBusy = await getDocs(qClass);
    if (!classBusy.empty) {
        alert(`CONFLICT DETECTED: Class ${className} already has a ${classBusy.docs[0].data().subject} period at this time!`);
        return;
    }

    await addDoc(collection(db, "timetable"), {
        day, slot, class: className, teacherId, teacherName, subject, timestamp: serverTimestamp()
    });

    alert("Period Allocated Successfully!");
    e.target.reset();
    renderTimetableGrid(document.getElementById('ttViewFilter').value);
}

async function renderTimetableGrid(filterClass = "") {
    const grid = document.getElementById('ttGrid');
    const headers = Array.from(grid.querySelectorAll('.tt-head'));
    grid.innerHTML = '';
    headers.forEach(h => grid.appendChild(h));

    const snapshot = await getDocs(collection(db, "timetable"));
    const data = snapshot.docs.map(d => ({id: d.id, ...d.data()}));

    const slots = [
        { id: "1", time: "08:00 - 09:00" },
        { id: "2", time: "09:00 - 10:00" },
        { id: "3", time: "10:00 - 11:00" },
        { id: "4", time: "11:00 - 12:00" },
        { id: "5", time: "13:00 - 14:00" }
    ];

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    slots.forEach(slot => {
        // Time Cell
        const timeCell = document.createElement('div');
        timeCell.className = 'tt-cell tt-time';
        timeCell.textContent = slot.time;
        grid.appendChild(timeCell);

        days.forEach(day => {
            const cell = document.createElement('div');
            cell.className = 'tt-cell';
            
            const entries = data.filter(d => d.day === day && d.slot === slot.id && (filterClass === "" || d.class === filterClass));
            
            entries.forEach(entry => {
                cell.innerHTML += `
                    <div class="tt-slot">
                        <strong>${entry.subject}</strong>
                        <span>${entry.teacherName}</span>
                        <small style="color:var(--accent-primary); font-weight:700;">${entry.class}</small>
                        <i class="fa-solid fa-trash" style="color:var(--danger); cursor:pointer; font-size:0.6rem; margin-top:0.25rem;" onclick="deleteDocById('timetable', '${entry.id}', () => renderTimetableGrid('${filterClass}'))"></i>
                    </div>
                `;
            });
            grid.appendChild(cell);
        });
    });
}

// --- CT ALLOCATION LOGIC ---
let allocationSections = []; 

async function populateAllocationDropdowns() {
    try {
        const tSnap = await getDocs(query(collection(db, "users"), where("role", "==", "teacher")));
        const cSnap = await getDocs(query(collection(db, "classes"), orderBy("name")));
        const sSnap = await getDocs(query(collection(db, "sections"), orderBy("name")));

        allocationSections = sSnap.docs.map(doc => doc.data());

        const aTeacher = document.getElementById('allocTeacher');
        const aClass = document.getElementById('allocClass');
        const aSection = document.getElementById('allocSection');

        if (!aTeacher || !aClass || !aSection) {
            console.error("DEBUG: One or more Allocation IDs missing from HTML!");
            return;
        }

        aTeacher.innerHTML = '<option value="">Select Teacher</option>';
        if (tSnap.empty) {
            aTeacher.innerHTML += '<option value="" disabled>No teachers found in database!</option>';
        } else {
            tSnap.forEach(d => aTeacher.innerHTML += `<option value="${d.id}">${d.data().name || d.data().email}</option>`);
        }

        aClass.innerHTML = '<option value="">Select Class</option>';
        cSnap.forEach(d => aClass.innerHTML += `<option value="${d.data().name}">${d.data().name}</option>`);

        aSection.innerHTML = '<option value="">Select Class First</option>';

        if (!aClass.dataset.allocListener) {
            aClass.addEventListener('change', (e) => {
                const className = e.target.value;
                aSection.innerHTML = '<option value="">Select Section</option>';
                const filtered = allocationSections.filter(s => s.parentClass === className);
                if (filtered.length === 0) {
                    aSection.innerHTML = '<option value="">No Sections Found</option>';
                } else {
                    filtered.forEach(s => aSection.innerHTML += `<option value="${s.name}">${s.name}</option>`);
                }
            });
            aClass.dataset.allocListener = "true";
        }

        fetchAllocationList();
    } catch (err) { 
        console.error("DEBUG ERROR:", err);
        alert("System Error: " + err.message); 
    }
}

async function handleCTAllocation() {

    const btn = document.getElementById('doAllocateBtn');
    
    const tid = document.getElementById('allocTeacher').value;
    const cls = document.getElementById('allocClass').value;
    const sec = document.getElementById('allocSection').value;

    if (!tid || !cls || !sec) {

        alert("Please select a Teacher, Class, and Section.");
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Verifying...';

    try {
        // --- DUPLICATE CHECK ---

        const qConflict = query(collection(db, "users"), where("role", "==", "teacher"), where("assignedClass", "==", cls), where("assignedSection", "==", sec), where("isClassTeacher", "==", true));
        const conflictSnap = await getDocs(qConflict);
        
        if (!conflictSnap.empty) {
            const existingCT = conflictSnap.docs[0].data();
            if (conflictSnap.docs[0].id !== tid) {
                if (!confirm(`Conflict: ${existingCT.name || existingCT.email} is already the Class Teacher for ${cls}-${sec}. Reassign to new teacher?`)) {
                    btn.disabled = false;
                    btn.textContent = 'Assign Responsibility';
                    return;
                }
                // Revoke existing

                await updateDoc(doc(db, "users", conflictSnap.docs[0].id), { isClassTeacher: false, assignedClass: "", assignedSection: "" });
            }
        }


        const teacherRef = doc(db, "users", tid);
        await updateDoc(teacherRef, {
            assignedClass: cls,
            assignedSection: sec,
            isClassTeacher: true
        });


        alert("Class Teacher Assigned Successfully!");
        document.getElementById('allocationForm').reset();
        
        // Reset section dropdown manually after form reset
        document.getElementById('allocSection').innerHTML = '<option value="">Select Section</option>';
        
        fetchAllocationList();
    } catch (err) {

        console.error(err);
        alert("Failed to assign: " + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Assign Responsibility';
    }
}

async function fetchAllocationList() {
    const snap = await getDocs(query(collection(db, "users"), where("role", "==", "teacher")));
    const list = document.getElementById('allocationList');
    list.innerHTML = '';
    
    let count = 0;
    snap.forEach(d => {
        const u = d.data();
        if (u.isClassTeacher) {
            count++;
            list.innerHTML += `
                <tr>
                    <td><strong>${u.name || u.email}</strong></td>
                    <td><span class="badge badge-info">${u.assignedClass} - ${u.assignedSection}</span></td>
                    <td><span class="badge badge-success">ACTIVE CT</span></td>
                    <td><button class="btn btn-secondary" onclick="revokeCT('${d.id}')">Revoke</button></td>
                </tr>`;
        }
    });

    if (count === 0) {
        list.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem; color: var(--text-muted);">No active class teachers assigned yet.</td></tr>';
    }
}

window.revokeCT = async (id) => {
    if(confirm("Revoke CT responsibilities?")) {
        await updateDoc(doc(db, "users", id), { isClassTeacher: false, assignedClass: "", assignedSection: "" });
        fetchAllocationList();
    }
};

// --- EXAMINATION MASTER ---
async function handleExamSchedule(e) {
    e.preventDefault();
    const data = {
        class: document.getElementById('examClass').value,
        subject: document.getElementById('examSubject').value,
        date: document.getElementById('examDate').value,
        time: document.getElementById('examTime').value,
        maxMarks: document.getElementById('examMaxMarks').value,
        status: "scheduled",
        timestamp: serverTimestamp()
    };
    await addDoc(collection(db, "exams"), data);
    alert("Examination Scheduled!"); e.target.reset(); fetchExams();
}

window.fetchExams = async function() {
    const classSnapshot = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const examClass = document.getElementById('examClass');
    if(examClass) {
        examClass.innerHTML = '<option value="">Select Class</option>';
        classSnapshot.forEach(d => examClass.innerHTML += `<option value="${d.data().name}">${d.data().name}</option>`);
    }

    const examsSnapshot = await getDocs(query(collection(db, "exams"), orderBy("date", "desc")));
    const list = document.getElementById('examList'); 
    if(list) {
        list.innerHTML = '';
        examsSnapshot.forEach(d => {
            const ex = d.data();
            list.innerHTML += `<tr><td><strong>${ex.subject}</strong></td><td>${ex.class}</td><td>${ex.date}</td><td><button class="btn btn-secondary" onclick="window.deleteDocById('exams', '${d.id}', 'fetchExams')">X</button></td></tr>`;
        });
    }
}

// --- ACADEMIC MASTER ---
async function handleClassAdd(e) {
    e.preventDefault();
    await addDoc(collection(db, "classes"), { name: document.getElementById('className').value, timestamp: serverTimestamp() });
    e.target.reset(); fetchClasses();
}

window.fetchClasses = async function() {
    const snapshot = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const list = document.getElementById('classList');
    const parentSelect = document.getElementById('sectionParentClass');
    if(list) list.innerHTML = ''; 
    if(parentSelect) parentSelect.innerHTML = '<option value="">Select Class</option>';
    
    snapshot.forEach(d => {
        if(list) list.innerHTML += `<tr><td>${d.data().name}</td><td><button class="btn btn-secondary" onclick="window.deleteDocById('classes', '${d.id}', 'fetchClasses')">X</button></td></tr>`;
        if(parentSelect) parentSelect.innerHTML += `<option value="${d.data().name}">${d.data().name}</option>`;
    });
}

async function handleSectionAdd(e) {
    e.preventDefault();
    await addDoc(collection(db, "sections"), { parentClass: document.getElementById('sectionParentClass').value, name: document.getElementById('sectionName').value, timestamp: serverTimestamp() });
    e.target.reset(); fetchSections();
}

window.fetchSections = async function() {
    const snapshot = await getDocs(query(collection(db, "sections"), orderBy("parentClass")));
    const list = document.getElementById('sectionList'); 
    if(list) {
        list.innerHTML = '';
        snapshot.forEach(d => list.innerHTML += `<tr><td>${d.data().name}</td><td>${d.data().parentClass}</td><td><button class="btn btn-secondary" onclick="window.deleteDocById('sections', '${d.id}', 'fetchSections')">X</button></td></tr>`);
    }
}

// --- NOTICE BOARD LOGIC ---
async function handleNoticeSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('submitNoticeBtn');
    const file = document.getElementById('noticeFile').files[0];
    const title = document.getElementById('noticeTitle').value;
    const content = document.getElementById('noticeContent').value;
    const audience = document.getElementById('noticeAudience').value;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Publishing...';

    try {
        let fileUrl = "";
        let fileType = "none";
        if (file) {
            const fileRef = ref(storage, `notices/${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            fileUrl = await getDownloadURL(fileRef);
            fileType = file.type.includes('pdf') ? 'pdf' : 'image';
        }

        await addDoc(collection(db, "notices"), {
            title,
            content,
            fileUrl,
            fileType,
            audience,
            author: 'Principal',
            timestamp: serverTimestamp()
        });

        alert("Notice Published Successfully!");
        e.target.reset();
        window.fetchNotices();
    } catch (err) {
        alert("Error publishing notice: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publish Notice';
    }
}

window.fetchNotices = async function() {
    const list = document.getElementById('noticeListBody');
    if(!list) return;
    list.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';

    const snap = await getDocs(query(collection(db, "notices"), orderBy("timestamp", "desc")));
    list.innerHTML = '';
    
    if (snap.empty) {
        list.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:3rem;color:var(--text-muted)">No notices published yet.</td></tr>';
        return;
    }

    snap.forEach(d => {
        const n = d.data();
        const date = n.timestamp ? n.timestamp.toDate().toLocaleDateString() : 'Just now';
        const fileIcon = n.fileType === 'pdf' ? '<i class="fa-solid fa-file-pdf" style="color:var(--danger)"></i>' : (n.fileType === 'image' ? '<i class="fa-solid fa-image" style="color:var(--brand-500)"></i>' : '---');
        
        list.innerHTML += `
            <tr>
                <td>${date}</td>
                <td><strong>${n.title}</strong></td>
                <td><span class="badge badge-neutral">${n.audience.toUpperCase()}</span></td>
                <td style="text-align:center">${n.fileUrl ? `<a href="${n.fileUrl}" target="_blank">${fileIcon}</a>` : '---'}</td>
                <td><button class="btn btn-secondary btn-sm" onclick="window.deleteDocById('notices', '${d.id}', 'fetchNotices')"><i class="fa-solid fa-trash-can"></i></button></td>
            </tr>`;
    });
}

// --- SYSTEM SETTINGS LOGIC ---
async function fetchSettings() {
    try {
        const docSnap = await getDoc(doc(db, "settings", "system"));
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('masterPhone').value = data.masterPhone || "";
            document.getElementById('autoAbsenceSms').checked = data.autoAbsenceSms || false;
            document.getElementById('autoFeeSms').checked = data.autoFeeSms || false;
        }
    } catch (err) { console.error("Error fetching settings:", err); }
}

async function handleSettingsSave(e) {
    e.preventDefault();
    const btn = document.getElementById('saveSettingsBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    const data = {
        masterPhone: document.getElementById('masterPhone').value,
        autoAbsenceSms: document.getElementById('autoAbsenceSms').checked,
        autoFeeSms: document.getElementById('autoFeeSms').checked,
        updatedBy: auth.currentUser.uid,
        lastUpdated: serverTimestamp()
    };

    try {
        await setDoc(doc(db, "settings", "system"), data);
        alert("System settings updated successfully!");
    } catch (err) {
        alert("Failed to save settings: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save System Configuration';
    }
}

async function fetchMessageLogs() {
    const list = document.getElementById('messageLogsBody');
    if(!list) return;
    
    try {
        const q = query(collection(db, "messages"), orderBy("timestamp", "desc"), where("timestamp", ">", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))); // Last 7 days
        const snap = await getDocs(q);
        list.innerHTML = '';
        
        if (snap.empty) {
            list.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:3rem; color:var(--text-muted)">No recent messages sent.</td></tr>';
            return;
        }

        snap.forEach(d => {
            const m = d.data();
            const time = m.timestamp ? m.timestamp.toDate().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Just now';
            const statusBadge = m.status === 'sent' ? 'badge-success' : 'badge-danger';
            
            list.innerHTML += `
                <tr>
                    <td>${time}</td>
                    <td>
                        <div style="font-weight:700">${m.recipientName}</div>
                        <div style="font-size:.7rem; color:var(--text-muted)">${m.recipientPhone}</div>
                    </td>
                    <td><span class="badge badge-info">${m.type.toUpperCase()}</span></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:0.5rem">
                            <span class="badge ${statusBadge}">${m.status.toUpperCase()}</span>
                            ${m.status === 'sent' ? `<button class="btn btn-primary btn-sm" onclick="window.sendWhatsAppDirect('${m.recipientPhone}', '${m.message.replace(/'/g, "\\'")}')" style="padding:2px 8px; font-size:0.65rem"><i class="fa-brands fa-whatsapp"></i> Send</button>` : ''}
                        </div>
                    </td>
                </tr>`;
        });
    } catch (err) {
        console.error("Error fetching message logs:", err);
        list.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--danger)">Error loading logs.</td></tr>';
    }
}

window.sendWhatsAppDirect = (phone, message) => {
    // Clean phone number (remove spaces, dashes, etc.)
    const cleanPhone = phone.replace(/\D/g, '');
    // Ensure it has country code (default to +91 if 10 digits)
    const finalPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
};

// --- STUDENT MASTER ---
window.fetchStudentMaster = async function() {
    const searchEl = document.getElementById('stuSearch');
    const filterClassEl = document.getElementById('stuFilterClass');
    const filterSectionEl = document.getElementById('stuFilterSection');

    const search = searchEl ? searchEl.value.toLowerCase() : '';
    const filterClass = filterClassEl ? filterClassEl.value : '';
    const filterSection = filterSectionEl ? filterSectionEl.value : '';

    const snapshot = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
    const list = document.getElementById('studentMasterTableBody'); list.innerHTML = '';
    
    let count = 1;
    snapshot.forEach(d => {
        const u = d.data();
        
        // Apply Filters
        const matchesSearch = !search || 
            (u.name && u.name.toLowerCase().includes(search)) || 
            (u.email && u.email.toLowerCase().includes(search)) || 
            (u.studentID && u.studentID.toLowerCase().includes(search));
        
        const matchesClass = !filterClass || u.class === filterClass;
        const matchesSection = !filterSection || u.section === filterSection;

        if (matchesSearch && matchesClass && matchesSection) {
            let b = u.status === 'suspended' ? 'badge-danger' : 'badge-success';
            list.innerHTML += `
                <tr>
                    <td>${count++}</td>
                    <td><span style="font-family:var(--font-mono);font-size:.75rem;font-weight:700;color:var(--brand-600)">${u.studentID || '---'}</span></td>
                    <td>
                        <div style="display:flex;flex-direction:column">
                            <strong>${u.name}</strong>
                            <span style="font-size:.7rem;color:var(--text-muted)">F: ${u.fatherName || '---'} | M: ${u.contact || '---'}</span>
                        </div>
                    </td>
                    <td><span class="badge badge-info">${u.class} - ${u.section}</span></td>
                    <td>${u.email}</td>
                    <td><span class="badge ${b}">${(u.status || 'active').toUpperCase()}</span></td>
                    <td>
                        <div style="display:flex; gap:.4rem">
                            <button class="btn btn-secondary btn-sm" onclick="window.showStudentDetails('${d.id}')" title="View Details"><i class="fa-solid fa-eye"></i></button>
                            <button class="btn btn-primary btn-sm" onclick="window.openEditStudentModal('${d.id}')" title="Edit Student"><i class="fa-solid fa-pencil"></i></button>
                            <button class="btn btn-secondary btn-sm" onclick="window.toggleStudentStatus('${d.id}', '${u.status || 'active'}')" title="Toggle Status"><i class="fa-solid fa-user-shield"></i></button> 
                            <button class="btn btn-secondary btn-sm" onclick="window.deleteDocById('users', '${d.id}', 'fetchStudentMaster')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>`;
        }
    });

    if (list.innerHTML === '') {
        list.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text-muted)">No students found matching these filters.</td></tr>';
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
    window.updateStudentMasterSections(); // Reset sections dropdown
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
        
        // Add listener for dependent dropdown if not already added
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
    
    // Refresh student list when section list changes
    window.fetchStudentMaster();
}

window.toggleStudentStatus = async (id, currentStatus) => {
    await updateDoc(doc(db, "users", id), { status: currentStatus === 'suspended' ? 'active' : 'suspended' });
    fetchStudentMaster();
};

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

    // Populate Class and Section dropdowns
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
    
    // Add listener for class change in edit modal
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
    } catch (err) {
        alert("Update failed: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Save Changes';
    }
}

// --- PROMOTION LOGIC ---
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
    const selectAll = document.getElementById('selectAllPromote');
    
    if (!sourceClass) {
        listBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted)">Select a source class to view students.</td></tr>';
        return;
    }

    listBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading Students...</td></tr>';
    
    const snapshot = await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("class", "==", sourceClass)));
    listBody.innerHTML = '';
    selectAll.checked = false;
    updatePromoteCount();

    if (snapshot.empty) {
        listBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted)">No students found in this class.</td></tr>';
        return;
    }

    snapshot.forEach(d => {
        const u = d.data();
        listBody.innerHTML += `
            <tr>
                <td><input type="checkbox" class="promote-check" value="${d.id}" onchange="window.updatePromoteCount()"></td>
                <td><span style="font-family:var(--font-mono); font-weight:700">${u.studentID || '---'}</span></td>
                <td>${u.name}</td>
                <td><span class="badge badge-info">${u.section}</span></td>
            </tr>
        `;
    });
}

window.toggleSelectAllPromote = function(source) {
    const checks = document.querySelectorAll('.promote-check');
    checks.forEach(c => c.checked = source.checked);
    window.updatePromoteCount();
}

window.updatePromoteCount = function() {
    const count = document.querySelectorAll('.promote-check:checked').length;
    document.getElementById('promoteCount').textContent = `${count} Students Selected`;
}

window.handleBulkPromotion = async function() {
    const targetClass = document.getElementById('promoteTargetClass').value;
    const selectedStudents = Array.from(document.querySelectorAll('.promote-check:checked')).map(c => c.value);
    const btn = document.getElementById('confirmPromoteBtn');

    if (!targetClass) {
        alert("Please select a Target Class for promotion.");
        return;
    }
    if (selectedStudents.length === 0) {
        alert("Please select at least one student to promote.");
        return;
    }

    const sourceClass = document.getElementById('promoteSourceClass').value;
    if (sourceClass === targetClass) {
        if (!confirm("Source and Target classes are same. Continue?")) return;
    }

    if (!confirm(`Are you sure you want to promote ${selectedStudents.length} students to ${targetClass}?`)) return;

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Promoting...`;

    try {
        let successCount = 0;
        for (const uid of selectedStudents) {
            await updateDoc(doc(db, "users", uid), { class: targetClass });
            successCount++;
        }
        alert(`Success! ${successCount} students promoted to ${targetClass}.`);
        document.getElementById('promoteModal').classList.remove('show');
        window.fetchStudentMaster();
    } catch (err) {
        alert("Promotion failed: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-arrow-up-right-dots"></i> Promote Selected`;
    }
}

let allSections = [];
async function populateAdmissionDropdowns() {
    const cSnap = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const sSnap = await getDocs(query(collection(db, "sections"), orderBy("name")));
    allSections = sSnap.docs.map(doc => doc.data());
    const admClass = document.getElementById('admClass');
    admClass.innerHTML = '<option value="">Select Class</option>';
    cSnap.forEach(d => admClass.innerHTML += `<option value="${d.data().name}">${d.data().name}</option>`);
    if (!admClass.dataset.listener) {
        admClass.addEventListener('change', (e) => {
            const admSection = document.getElementById('admSection');
            admSection.innerHTML = '<option value="">Select Section</option>';
            allSections.filter(s => s.parentClass === e.target.value).forEach(s => admSection.innerHTML += `<option value="${s.name}">${s.name}</option>`);
        });
        admClass.dataset.listener = "true";
    }
}

async function handleAdmission(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const name = document.getElementById('admName').value;
    const email = document.getElementById('admEmail').value;
    const studentClass = document.getElementById('admClass').value;
    const section = document.getElementById('admSection').value;
    const studentID = document.getElementById('admUID').value;
    const password = document.getElementById('admPassword').value;

    const fatherName = document.getElementById('admFather').value;
    const motherName = document.getElementById('admMother').value;
    const contact = document.getElementById('admContact').value;
    const address = document.getElementById('admAddress').value;

    if(!name || !email || !studentClass || !section || !studentID || !password || !fatherName || !motherName || !contact || !address) {
        alert("Please fill all fields including guardian details.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';

    try {
        // 1. Create User in Firebase Auth using secondary app
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const user = userCredential.user;
        const uid = user.uid;

        // 2. Add Student Data to Firestore with the Auth UID
        await setDoc(doc(db, "users", uid), {
            uid: uid,
            studentID: studentID,
            name: name,
            email: email,
            role: "student",
            class: studentClass,
            section: section,
            fatherName: fatherName,
            motherName: motherName,
            contact: contact,
            address: address,
            status: "active",
            pendingFees: 15000, // Initial admission/tuition fee balance
            timestamp: serverTimestamp()
        });

        // 3. Sign out from secondary app to cleanup
        await secondaryAuth.signOut();

        alert(`Success! Student Admitted.\n\nStudent ID: ${studentID}\nPassword: ${password}\n\nPlease share these credentials with the student.`);
        e.target.reset();
        generateStudentID();
        fetchAllStats();
    } catch (error) {
        console.error("Admission Error:", error);
        alert("Error during admission: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Confirm Admission & Create Account';
    }
}

async function handleStaffAdd(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const name = document.getElementById('staffName').value;
    const email = document.getElementById('staffEmail').value;
    const role = document.getElementById('staffRole').value;
    const password = document.getElementById('staffPassword').value;
    
    // New fields
    const category = document.getElementById('staffCategory').value;
    const designation = document.getElementById('staffDesignation').value;
    const qualification = document.getElementById('staffQualification').value;
    const gender = document.getElementById('staffGender').value;
    const contact = document.getElementById('staffContact').value;
    const joiningDate = document.getElementById('staffJoiningDate').value;
    const experience = document.getElementById('staffExperience').value;
    const address = document.getElementById('staffAddress').value;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Provisioning Account...';

    try {
        // 1. Create in Auth (Secondary)
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const uid = userCred.user.uid;

        // 2. Save in Firestore
        await setDoc(doc(db, "users", uid), {
            uid, 
            name, 
            email, 
            role,
            category,
            designation,
            qualification,
            gender,
            contact,
            joiningDate,
            experience,
            address,
            status: "active",
            timestamp: serverTimestamp()
        });

        await secondaryAuth.signOut();
        alert(`Staff Account Created Successfully!\nRole: ${role}\nEmail: ${email}\nPassword: ${password}`);
        e.target.reset();
        window.fetchStaffList();
    } catch (err) {
        alert("Error creating staff: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Staff Account';
    }
}

window.fetchStaffList = async function() {
    const list = document.getElementById('staffTableBody');
    if(!list) return;
    list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading Staff...</td></tr>';

    try {
        const q = query(collection(db, "users"), where("role", "in", ["teacher", "accountant", "principal"]));
        const snap = await getDocs(q);
        list.innerHTML = '';
        
        if (snap.empty) {
            list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--text-muted)">No staff accounts found.</td></tr>';
            return;
        }

        snap.forEach(d => {
            const u = d.data();
            const statusClass = (u.status || 'active') === 'active' ? 'badge-success' : 'badge-danger';
            
            list.innerHTML += `
                <tr>
                    <td>
                        <div style="font-weight:700">${u.name}</div>
                        <div style="font-size:.7rem; color:var(--text-muted)">${u.email}</div>
                    </td>
                    <td><span class="badge badge-neutral">${(u.category || 'N/A').toUpperCase()}</span></td>
                    <td>${u.designation || '---'}</td>
                    <td>${u.contact || '---'}</td>
                    <td><span class="badge ${statusClass}">${(u.status || 'ACTIVE').toUpperCase()}</span></td>
                    <td>
                        <div style="display:flex;gap:.4rem">
                            <button class="btn btn-secondary btn-sm" onclick="alert('Full details: ${u.qualification || "N/A"}, Exp: ${u.experience || 0}yrs')" title="View Details"><i class="fa-solid fa-eye"></i></button>
                            <button class="btn btn-secondary btn-sm" onclick="window.deleteDocById('users', '${d.id}', 'fetchStaffList')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>`;
        });
    } catch (err) {
        console.error("Staff List Error:", err);
        list.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--danger)">Error loading staff directory.</td></tr>`;
    }
}

window.deleteDocById = async (col, id, callback) => {
    console.log(`Attempting to delete from ${col}, ID: ${id}`);
    if (confirm("Are you sure you want to delete this record? This action cannot be undone.")) {
        try {
            const docRef = doc(db, col, id);
            
            // First, check if it exists
            const beforeSnap = await getDoc(docRef);
            if (!beforeSnap.exists()) {
                alert("Error: Record not found in database. It may have already been deleted.");
                if (callback) window[callback] ? window[callback]() : (typeof callback === 'function' ? callback() : null);
                return;
            }

            await deleteDoc(docRef);
            
            // Verify deletion
            const afterSnap = await getDoc(docRef);
            if (afterSnap.exists()) {
                throw new Error("Verification failed: Document still exists after deletion attempt. Check your Firebase security rules.");
            }

            console.log("Delete successful and verified");
            alert("Record deleted successfully.");
            
            if (callback) {
                if (typeof callback === 'function') {
                    callback();
                } else if (typeof window[callback] === 'function') {
                    window[callback]();
                }
            }
        } catch (err) {
            console.error("Delete Error:", err);
            alert("Delete failed: " + err.message);
        }
    }
};

window.fetchTransport = async function() {
    const snap = await getDocs(query(collection(db, "transport"), orderBy("route")));
    const list = document.getElementById('transportList'); 
    if(list) {
        list.innerHTML = '';
        snap.forEach(d => {
            const t = d.data();
            list.innerHTML += `<tr><td>${t.route || '---'}</td><td>${t.vehicle || '---'}</td><td>${t.driver || '---'}</td><td>---</td><td><button class="btn btn-secondary" onclick="window.deleteDocById('transport', '${d.id}', 'fetchTransport')">X</button></td></tr>`;
        });
    }
}

async function handleTransportAdd(e) {
    e.preventDefault();
    await addDoc(collection(db, "transport"), { route: document.getElementById('route').value, vehicle: document.getElementById('vehicle').value, timestamp: serverTimestamp() });
    e.target.reset(); fetchTransport();
}

window.showMyProfile = async function() {
    const user = auth.currentUser;
    if (!user) { alert("Session expired. Please login again."); return; }

    const modal = document.getElementById('profileDetailModal');
    const content = document.getElementById('profileDetailContent');
    if(!modal || !content) return;

    content.innerHTML = '<div style="text-align:center;padding:2rem"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p>Loading Profile...</p></div>';
    modal.classList.add('show');

    try {
        const d = await getDoc(doc(db, "users", user.uid));
        if (!d.exists()) {
            content.innerHTML = '<div class="empty-state"><h3>Profile not found</h3><p>Your user record could not be located.</p></div>';
            return;
        }

        const u = d.data();
        const avatar = u.name ? u.name.charAt(0).toUpperCase() : '?';
        
        content.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:1rem; margin-bottom:2rem">
                <div style="width:80px; height:80px; border-radius:50%; background:var(--brand-600); color:white; display:flex; align-items:center; justify-content:center; font-size:2.5rem; font-weight:800; box-shadow:var(--shadow-lg)">${avatar}</div>
                <div style="text-align:center">
                    <h2 style="margin:0; color:var(--text-primary)">${u.name || 'User'}</h2>
                    <span class="badge badge-primary" style="margin-top:0.25rem">${(u.role || 'Principal').toUpperCase()}</span>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr; gap:1rem; border-top:1px solid var(--border); padding-top:1.5rem">
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Email Address</span>
                    <span style="font-weight:700">${u.email || 'N/A'}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Staff Category</span>
                    <span style="font-weight:700; color:var(--brand-600)">${(u.category || 'Administration').toUpperCase()}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Designation</span>
                    <span style="font-weight:700">${u.designation || 'Institutional Head'}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Contact Number</span>
                    <span style="font-weight:700">${u.contact || 'N/A'}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Status</span>
                    <span class="badge badge-success">${(u.status || 'ACTIVE').toUpperCase()}</span>
                </div>
            </div>
            <div style="margin-top:1.5rem; padding:1rem; background:var(--bg-muted); border-radius:var(--r-md); font-size:0.8rem">
                <i class="fa-solid fa-shield-halved" style="color:var(--brand-600)"></i> This is your private institutional profile. If you notice any discrepancies, please contact the IT Administrator.
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
}

async function fetchFeeData() {
    const snap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
    const list = document.getElementById('feeTableBody'); list.innerHTML = '';
    
    let totalPending = 0;
    
    // Get total collection from fees collection
    const feeSnap = await getDocs(collection(db, "fees"));
    let totalCollected = 0;
    feeSnap.forEach(d => totalCollected += Number(d.data().amount));

    snap.forEach(d => {
        const u = d.data();
        const pending = u.pendingFees || 0;
        totalPending += pending;

        if (pending > 0) {
            list.innerHTML += `
                <tr>
                    <td><strong>${u.name}</strong></td>
                    <td><span class="badge badge-info">${u.class}</span></td>
                    <td style="color:var(--danger-dark);font-weight:700">₹${pending.toLocaleString()}</td>
                    <td>Pending Balance</td>
                    <td><button class="btn btn-secondary btn-sm" onclick="alert('Sending reminder to ${u.name}...')"><i class="fa-solid fa-bell"></i> Remind</button></td>
                </tr>`;
        }
    });

    if (document.getElementById('principalTotalPending')) document.getElementById('principalTotalPending').textContent = `₹${totalPending.toLocaleString()}`;
    if (document.getElementById('principalTotalCollected')) document.getElementById('principalTotalCollected').textContent = `₹${totalCollected.toLocaleString()}`;

    if (list.innerHTML === '') {
        list.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">No outstanding fees recorded.</td></tr>';
    }
}

async function fetchStaffLeaves() {
    const list = document.getElementById('staffLeavesTableBody');
    if(!list) return;
    list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem"><i class="fa-solid fa-spinner fa-spin"></i> Fetching Leave Applications...</td></tr>';

    try {
        const q = query(collection(db, "leaves"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        list.innerHTML = '';

        if (snap.empty) {
            list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--text-muted)">No staff leave applications found.</td></tr>';
            return;
        }

        snap.forEach(d => {
            const l = d.data();
            const statusClass = l.status === 'approved' ? 'badge-success' : (l.status === 'rejected' ? 'badge-danger' : 'badge-info');
            
            list.innerHTML += `
                <tr>
                    <td><strong>${l.teacherName || 'Unknown Staff'}</strong></td>
                    <td><span class="badge badge-info">${l.type}</span></td>
                    <td>${l.startDate} to ${l.endDate}</td>
                    <td style="max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis" title="${l.reason}">${l.reason}</td>
                    <td><span class="badge ${statusClass}">${l.status.toUpperCase()}</span></td>
                    <td>
                        ${l.status === 'pending' ? `
                            <div style="display:flex;gap:.5rem">
                                <button class="btn btn-primary btn-sm" onclick="window.updateLeaveStatus('${d.id}', 'approved')" title="Approve"><i class="fa-solid fa-check"></i></button>
                                <button class="btn btn-secondary btn-sm" onclick="window.updateLeaveStatus('${d.id}', 'rejected')" title="Reject"><i class="fa-solid fa-xmark"></i></button>
                            </div>
                        ` : '<span style="font-size:.7rem;color:var(--text-muted);font-weight:600">PROCESSED</span>'}
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error("Staff Leaves Error:", err);
        list.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--danger)">Error loading leaves: ${err.message}</td></tr>`;
    }
}

window.updateLeaveStatus = async function(leaveId, newStatus) {
    if (!confirm(`Are you sure you want to ${newStatus} this leave request?`)) return;
    
    try {
        await updateDoc(doc(db, "leaves", leaveId), {
            status: newStatus,
            processedAt: serverTimestamp()
        });
        alert(`Leave Application ${newStatus.toUpperCase()}`);
        fetchStaffLeaves();
    } catch (err) {
        alert("Action failed: " + err.message);
    }
};

window.logoutBtn = document.getElementById('logoutBtn');
if(window.logoutBtn) {
    window.logoutBtn.addEventListener('click', () => signOut(auth).then(() => window.location.href = 'index.html'));
}
