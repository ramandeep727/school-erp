import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const sections = {
    overview: document.getElementById('sectionOverview'),
    idcard: document.getElementById('sectionIdCard'),
    academics: document.getElementById('sectionAcademics'),
    reportcard: document.getElementById('sectionReportcard'),
    assignments: document.getElementById('sectionAssignments'),
    notices: document.getElementById('sectionNotices'),
    fees: document.getElementById('sectionFees')
};

const userNameEl   = document.getElementById('userName');
const userClassEl   = document.getElementById('userClass');
const userAvatarEl  = document.getElementById('userAvatar');
const headerName   = document.getElementById('headerName');
const headerAvatar = document.getElementById('headerAvatar');
const headerClass  = document.getElementById('headerClass');
const logoutBtn    = document.getElementById('logoutBtn');

let currentStudent = null;

// Auth State
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists() && docSnap.data().role === 'student') {
            currentStudent = { id: user.uid, ...docSnap.data() };
            const displayName = currentStudent.name || user.email;
            const initial = displayName.charAt(0).toUpperCase();
            const classInfo = `${currentStudent.class} - ${currentStudent.section}`;
            if (userNameEl)   userNameEl.textContent   = displayName;
            if (userClassEl)  userClassEl.textContent  = classInfo;
            if (userAvatarEl) userAvatarEl.textContent = initial;
            if (headerName)   headerName.textContent   = displayName;
            if (headerAvatar) headerAvatar.textContent = initial;
            if (headerClass)  headerClass.textContent  = classInfo;
            initStudentDashboard();
        } else { window.location.href = 'index.html'; }
    } else { window.location.href = 'index.html'; }
});

function initStudentDashboard() {
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.id.replace('nav', '').toLowerCase();
            switchSection(target);
        });
    });

    fetchStats();
    window.fetchNotices();
}

const sectionLabels = {
    overview:'My Dashboard', idcard:'Digital ID Card', academics:'Academics',
    reportcard:'Report Card', assignments:'Assignments', fees:'Fees & Dues'
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
    if (target === 'idcard') generateDigitalID();
    if (target === 'academics') fetchAcademicRecords();
    if (target === 'reportcard') populateReportCard();
    if (target === 'assignments') fetchAssignments();
    if (target === 'fees') fetchFeeStatus();
    if (target === 'notices') window.fetchNotices();
};

async function fetchStats() {
    const dateEl = document.getElementById('currentDate');
    if(dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const q = query(collection(db, "attendance"), where("studentId", "==", currentStudent.id));
    const snap = await getDocs(q);
    const total = snap.size;
    const present = snap.docs.filter(d => d.data().status === 'present').length;
    const perc = total > 0 ? ((present / total) * 100).toFixed(0) : 100;
    document.getElementById('attendancePerc').textContent = `${perc}%`;
}

function generateDigitalID() {
    if (document.getElementById('idName')) document.getElementById('idName').textContent = currentStudent.name;
    if (document.getElementById('idUID'))  document.getElementById('idUID').textContent  = `ID: ${currentStudent.studentID || 'N/A'}`;
    if (document.getElementById('idClass')) document.getElementById('idClass').textContent = `Class: ${currentStudent.class} - ${currentStudent.section}`;
    if (document.getElementById('idEmail')) document.getElementById('idEmail').textContent = currentStudent.email;
    if (document.getElementById('idAvatar')) document.getElementById('idAvatar').textContent = currentStudent.name.charAt(0);

    // Generate QR using public API - encodes the student UID
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${currentStudent.id}`;
    if (document.getElementById('studentQR')) document.getElementById('studentQR').src = qrUrl;
}

async function fetchAcademicRecords() {
    const q = query(collection(db, "marks"), where("studentId", "==", currentStudent.id), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    const list = document.getElementById('studentMarksBody');
    list.innerHTML = '';
    snap.forEach(d => {
        const m = d.data();
        list.innerHTML += `<tr><td>${m.subject}</td><td>${m.examId}</td><td>${m.marksObtained}/${m.maxMarks}</td><td><span class="badge badge-info">${m.grade}</span></td></tr>`;
    });
}

async function fetchAssignments() {
    const q = query(
        collection(db, "assignments"), 
        where("class", "==", currentStudent.class),
        where("section", "==", currentStudent.section),
        orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    const list = document.getElementById('studentAssignList');
    if(!list) return;
    list.innerHTML = '';
    
    if (snap.empty) {
        list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-tasks"></i><h3>No assignments</h3><p>Your teachers haven\'t posted any assignments for your section yet.</p></div>';
        return;
    }

    snap.forEach(d => {
        const a = d.data();
        list.innerHTML += `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem;border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:.75rem;background:white;transition:var(--t)">
                <div style="display:flex;align-items:center;gap:1rem">
                  <div style="width:42px;height:42px;border-radius:var(--r-md);background:var(--info-light);color:var(--brand-600);display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0">
                    <i class="fa-solid fa-book-open"></i>
                  </div>
                  <div>
                    <strong style="font-size:.9rem;color:var(--text-primary)">${a.title}</strong>
                    <p style="font-size:.78rem;color:var(--text-muted);margin:.15rem 0 0">${a.subject} &middot; Due: <strong style="color:var(--warning-dark)">${a.deadline}</strong></p>
                    <p style="font-size:.65rem;color:var(--text-muted);margin-top:.1rem">By: ${a.teacherName || 'Teacher'}</p>
                  </div>
                </div>
                ${a.fileUrl ? `<a href="${a.fileUrl}" target="_blank" class="btn btn-primary btn-sm"><i class="fa-solid fa-download"></i> Download</a>` : '<span class="badge badge-neutral">No File</span>'}
            </div>
        `;
    });
}

async function populateReportCard() {
    const q = query(collection(db, "marks"), where("studentId", "==", currentStudent.id));
    const snap = await getDocs(q);
    
    document.getElementById('reportCardDate').textContent = `Date: ${new Date().toLocaleDateString()}`;
    document.getElementById('repStudentName').textContent = currentStudent.name;
    document.getElementById('repStudentClass').textContent = `Class: ${currentStudent.class} - ${currentStudent.section}`;
    document.getElementById('repStudentEmail').textContent = currentStudent.email;

    const list = document.getElementById('reportCardTableBody');
    list.innerHTML = '';
    
    let totalObtained = 0;
    let totalMax = 0;

    snap.forEach(d => {
        const m = d.data();
        totalObtained += parseFloat(m.marksObtained);
        totalMax += parseFloat(m.maxMarks);

        list.innerHTML += `
            <tr>
                <td><strong>${m.subject}</strong></td>
                <td>${m.maxMarks}</td>
                <td>${m.marksObtained}</td>
                <td>${m.percentage}%</td>
                <td><span class="badge badge-info">${m.grade}</span></td>
            </tr>
        `;
    });

    const finalPerc = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : 0;
    document.getElementById('repFinalPerc').textContent = `Total Percentage: ${finalPerc}%`;
    
    let finalGrade = 'D';
    if (finalPerc >= 90) finalGrade = 'A+';
    else if (finalPerc >= 80) finalGrade = 'A';
    else if (finalPerc >= 70) finalGrade = 'B';
    else if (finalPerc >= 60) finalGrade = 'C';
    
    document.getElementById('repFinalGrade').textContent = finalGrade;
}

async function fetchFeeStatus() {
    const list = document.getElementById('sectionFees');
    if(!list) return;

    // Get latest student data for fresh balance
    const docSnap = await getDoc(doc(db, "users", currentStudent.id));
    const u = docSnap.data();
    const pending = u.pendingFees || 0;

    const feeQuery = query(collection(db, "fees"), where("studentID", "==", u.studentID), orderBy("timestamp", "desc"));
    const feeSnap = await getDocs(feeQuery);

    let historyHtml = '';
    feeSnap.forEach(d => {
        const f = d.data();
        historyHtml += `
            <div style="display:flex;justify-content:space-between;padding:1rem;border-bottom:1px solid var(--border)">
                <div>
                    <strong style="font-size:.9rem">${f.feeType.toUpperCase()}</strong>
                    <p style="font-size:.75rem;color:var(--text-muted)">${f.date}</p>
                </div>
                <div style="text-align:right">
                    <strong style="color:var(--success-dark)">₹${Number(f.amount).toLocaleString()}</strong>
                    <p style="font-size:.7rem;color:var(--success);font-weight:700">PAID</p>
                </div>
            </div>`;
    });

    list.innerHTML = `
        <div class="page-title-row"><div><h1>Fees & Financial Status</h1><p>Track your fee payments and dues</p></div></div>
        
        <div style="display:grid;grid-template-columns:1fr 2fr;gap:1.5rem">
            <div class="content-card" style="height:fit-content">
                <div class="card-header"><h2><i class="fa-solid fa-wallet"></i> Current Balance</h2></div>
                <div class="card-body" style="text-align:center;padding:2rem">
                    <div style="font-size:2.5rem;font-weight:800;color:${pending > 0 ? 'var(--danger-dark)' : 'var(--success-dark)'}">₹${pending.toLocaleString()}</div>
                    <p style="font-weight:700;color:var(--text-muted);text-transform:uppercase;font-size:.75rem;margin-top:.5rem">Total Outstanding Dues</p>
                    ${pending > 0 ? `<button class="btn btn-primary" style="margin-top:1.5rem;width:100%"><i class="fa-solid fa-credit-card"></i> Pay Online</button>` : ''}
                </div>
            </div>

            <div class="content-card">
                <div class="card-header"><h2><i class="fa-solid fa-clock-rotate-left"></i> Payment History</h2></div>
                <div class="card-body" style="padding:0">
                    ${historyHtml || '<div style="padding:3rem;text-align:center;color:var(--text-muted)">No payment history found.</div>'}
                </div>
            </div>
        </div>
    `;
}

// --- NOTICE BOARD LOGIC ---
window.fetchNotices = async function() {
    const briefList = document.getElementById('noticeBriefList');
    const fullList = document.getElementById('fullNoticeList');
    if (!briefList && !fullList) return;

    try {
        const snap = await getDocs(query(collection(db, "notices"), where("audience", "in", ["all", "students"]), orderBy("timestamp", "desc")));
        
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
            content.innerHTML = '<div class="empty-state"><h3>Profile not found</h3><p>Your student record could not be located.</p></div>';
            return;
        }

        const u = d.data();
        const avatar = u.name ? u.name.charAt(0).toUpperCase() : '?';
        
        content.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:1rem; margin-bottom:2rem">
                <div style="width:80px; height:80px; border-radius:var(--r-full); background:linear-gradient(135deg,var(--brand-600),#8b5cf6); color:white; display:flex; align-items:center; justify-content:center; font-size:2.5rem; font-weight:800; box-shadow:var(--shadow-lg)">${avatar}</div>
                <div style="text-align:center">
                    <h2 style="margin:0; color:var(--text-primary)">${u.name || 'Student'}</h2>
                    <span class="badge badge-info" style="margin-top:0.25rem">STUDENT ID: ${u.studentID || '---'}</span>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr; gap:1rem; border-top:1px solid var(--border); padding-top:1.5rem">
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Current Class</span>
                    <span style="font-weight:700">${u.class} - ${u.section}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Email</span>
                    <span style="font-weight:700">${u.email || 'N/A'}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Father's Name</span>
                    <span style="font-weight:700">${u.fatherName || '---'}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Mother's Name</span>
                    <span style="font-weight:700">${u.motherName || '---'}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Contact Number</span>
                    <span style="font-weight:700">${u.contact || 'N/A'}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Address</span>
                    <span style="font-weight:700; font-size:0.8rem; text-align:right">${u.address || '---'}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Fees Balance</span>
                    <span style="font-weight:700; color:${(u.pendingFees || 0) > 0 ? 'var(--danger-dark)' : 'var(--success-dark)'}">₹${(u.pendingFees || 0).toLocaleString()}</span>
                </div>
            </div>
            <div style="margin-top:1.5rem; padding:1rem; background:var(--info-light); border-radius:var(--r-md); font-size:0.75rem; color:var(--brand-700); font-weight:600">
                <i class="fa-solid fa-graduation-cap"></i> Keep your profile data updated for accurate institutional records and communication.
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
}

logoutBtn.addEventListener('click', () => signOut(auth).then(() => window.location.href = 'index.html'));
