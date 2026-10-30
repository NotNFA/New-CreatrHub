const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
// Load local .env values without an extra dependency.
try {
  const envText = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['\"]|['\"]$/g, '');
  }
} catch {}


const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL || true, methods: ['GET','POST','PUT','PATCH','DELETE'] } });
app.set('io', io);
io.use((socket, next) => {
  try {
    const raw = socket.handshake.auth?.token || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
    if (!token) return next(new Error('Authentication required'));
    socket.user = jwt.verify(token, process.env.JWT_SECRET || 'change-this-secret-before-production');
    next();
  } catch { next(new Error('Invalid or expired authentication token')); }
});
io.on('connection', socket => {
  const userId = Number(socket.user.id);
  if (!Number.isInteger(userId) || userId < 1) return socket.disconnect(true);
  socket.join(`user:${userId}`);
});
function emitUser(userId, event, payload) { if (userId) io.to(`user:${Number(userId)}`).emit(event, payload); }
function emitMeeting(meeting, event) {
  if (!meeting) return;
  const safe = { id: meeting.id, status: meeting.status, requester_id: meeting.requester_id, receiver_id: meeting.receiver_id, title: meeting.title, meeting_date: meeting.status === 'confirmed' ? meeting.meeting_date : null, duration: meeting.status === 'confirmed' ? meeting.duration : null, meeting_type: meeting.status === 'confirmed' ? meeting.meeting_type : null, join_url: meeting.status === 'confirmed' ? meeting.join_url : '', updated_at: meeting.updated_at };
  emitUser(meeting.requester_id, event, safe); emitUser(meeting.receiver_id, event, safe);
  emitUser(meeting.requester_id, 'notification:new', { type:'meeting', meetingId:meeting.id, status:meeting.status });
  emitUser(meeting.receiver_id, 'notification:new', { type:'meeting', meetingId:meeting.id, status:meeting.status });
}
app.use((req,res,next)=>{
  const origin=req.headers.origin;
  if(origin === 'null' || (origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  if(req.method==='OPTIONS') return res.sendStatus(204);
  next();
});
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-production';
const db = new Database(path.join(__dirname, 'creatrhub.db'));
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
function addColumn(table,column,type,def=''){
  const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
  if(!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${def?` DEFAULT ${def}`:''}`);
}
// Migrate databases created by the earlier CreatrHub version.
['qualifications','skills','socials_json','sample_works','work_mode','expected_salary'].forEach(c=>addColumn('creator_profiles',c,'TEXT',"''"));
addColumn('client_profiles','company','TEXT',"''"); addColumn('client_profiles','bio','TEXT',"''"); addColumn('client_profiles','social_url','TEXT',"''"); addColumn('creator_profiles','rating','REAL','0'); addColumn('creator_profiles','rating_count','INTEGER','0'); addColumn('client_profiles','rating','REAL','0'); addColumn('client_profiles','rating_count','INTEGER','0');
try{ db.prepare("UPDATE creator_profiles SET socials_json='{}' WHERE socials_json IS NULL OR socials_json='' ").run(); }catch(e){}

// Demo marketplace data: fictional Indian creators and client projects make a fresh install feel populated.
function seedDemoData(){
  const passwordHash=bcrypt.hashSync('Demo@12345',10);
  const creators=[
    ['Aarav Mehta','aarav.mehta@creatrhub.demo','UI/UX Designer',5,'B.Des in Interaction Design','Figma, UX Research, Prototyping, Design Systems','Product designer focused on clean, user-friendly digital experiences.','Freelance','₹1,500/hr','1500'],
    ['Ishita Sharma','ishita.sharma@creatrhub.demo','UI/UX Designer',4,'B.Des in Communication Design','Figma, Wireframing, User Flows, Mobile UI','UI/UX designer who turns complex ideas into simple, polished interfaces.','Full-time','₹45,000/month','1800'],
    ['Rohan Kapoor','rohan.kapoor@creatrhub.demo','UI/UX Designer',7,'M.Des in User Experience','Figma, UX Strategy, SaaS, Design Systems','Senior product designer experienced with SaaS dashboards and consumer apps.','Contract','₹2,500/hr','2500'],
    ['Sneha Iyer','sneha.iyer@creatrhub.demo','UI/UX Designer',3,'BCA, UX Design Certification','Figma, Framer, UX Audit, Landing Pages','UI/UX designer with a strong eye for modern web and startup branding.','Freelance','₹1,200/hr','1200'],
    ['Kabir Malhotra','kabir.malhotra@creatrhub.demo','Graphic Designer',6,'BFA in Applied Arts','Photoshop, Illustrator, Branding, Posters','Brand and visual designer creating bold identities and campaign graphics.','Freelance','₹1,000/hr','1000'],
    ['Priya Nair','priya.nair@creatrhub.demo','Graphic Designer',4,'B.Des in Visual Communication','Illustrator, Photoshop, Social Media, Packaging','Graphic designer specializing in social creatives, packaging and brand systems.','Part-time','₹850/hr','850'],
    ['Aditya Verma','aditya.verma@creatrhub.demo','Graphic Designer',8,'Diploma in Graphic Design','Brand Identity, Illustrator, Typography, Print','Experienced visual designer helping brands build memorable identities.','Contract','₹1,800/hr','1800'],
    ['Meera Joshi','meera.joshi@creatrhub.demo','Graphic Designer',2,'BA in Fine Arts','Canva, Illustrator, Photoshop, Social Creatives','Creative designer for social media campaigns, thumbnails and digital artwork.','Freelance','₹700/hr','700'],
    ['Arjun Bhatia','arjun.bhatia@creatrhub.demo','Video Editor',6,'Diploma in Film Editing','Premiere Pro, After Effects, DaVinci Resolve, Reels','Video editor focused on high-retention short-form content and branded videos.','Freelance','₹1,500/hr','1500'],
    ['Neha Gupta','neha.gupta@creatrhub.demo','Video Editor',5,'BMM in Mass Media','Premiere Pro, CapCut, YouTube, Color Grading','YouTube and social video editor with a fast, story-first editing style.','Full-time','₹50,000/month','1600'],
    ['Vikram Singh','vikram.singh@creatrhub.demo','Video Editor',9,'Diploma in Digital Filmmaking','Premiere Pro, Resolve, Documentary, Sound Design','Senior editor experienced in commercials, documentaries and long-form storytelling.','Contract','₹2,200/hr','2200'],
    ['Ananya Rao','ananya.rao@creatrhub.demo','Video Editor',3,'Certificate in Video Production','Premiere Pro, After Effects, Shorts, Motion','Versatile editor for reels, podcasts and creator content with quick turnaround.','Part-time','₹900/hr','900'],
    ['Yash Thakur','yash.thakur@creatrhub.demo','VFX Artist',7,'B.Des in Animation & VFX','After Effects, Blender, Nuke, Compositing','VFX artist creating polished composites, cleanup work and cinematic effects.','Freelance','₹2,000/hr','2000'],
    ['Kavya Menon','kavya.menon@creatrhub.demo','VFX Artist',5,'B.Sc in Animation','Blender, Houdini, After Effects, 3D','3D and VFX artist working across motion design, product visuals and compositing.','Contract','₹1,800/hr','1800'],
    ['Manav Sethi','manav.sethi@creatrhub.demo','VFX Artist',10,'Diploma in VFX & Compositing','Nuke, Houdini, Maya, Compositing','Senior VFX artist with a focus on cinematic compositing and CG integration.','Full-time','₹2,800/hr','2800'],
    ['Diya Kulkarni','diya.kulkarni@creatrhub.demo','VFX Artist',3,'Advanced VFX Certification','After Effects, Blender, Rotoscopy, Tracking','VFX artist creating energetic social effects, product shots and motion graphics.','Freelance','₹1,100/hr','1100']
  ];
  const insertUser=db.prepare('INSERT OR IGNORE INTO users(name,email,password_hash,role) VALUES(?,?,?,?)');
  const insertProfile=db.prepare(`INSERT OR IGNORE INTO creator_profiles(user_id,category,experience_years,qualifications,skills,bio,portfolio_url,social_url,socials_json,sample_works,work_mode,expected_salary,hourly_rate) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const creatorRatings=[4.9,4.8,4.7,4.9,4.8,4.9,4.7,4.8,4.9,4.8,5.0,4.7,4.9,4.8,4.9,4.7];
  const creatorReviewCounts=[38,27,19,24,31,22,44,16,35,28,51,18,29,23,47,14];
  for(let i=0;i<creators.length;i++){
    const c=creators[i];
    const info=insertUser.run(c[0],c[1],passwordHash,'creator');
    const u=db.prepare('SELECT id FROM users WHERE email=?').get(c[1]);
    if(info.changes) insertProfile.run(u.id,c[2],c[3],c[4],c[5],c[6],'https://example.com/creatrhub/'+u.id,'https://example.com/creatrhub/'+u.id,JSON.stringify({instagram:'',linkedin:'',behance:'',website:''}),'',c[7],c[8],c[9]);
    db.prepare('UPDATE creator_profiles SET rating=?, rating_count=? WHERE user_id=?').run(creatorRatings[i],creatorReviewCounts[i],u.id);
  }

  const clients=[
    ['Rahul Khanna','rahul.khanna@creatrhub.demo','Northstar Labs','We are a growing startup looking for reliable creative partners for product and marketing work.'],
    ['Simran Kapoor','simran.kapoor@creatrhub.demo','PixelMint Studio','Creative studio looking for specialists across branding, video and motion projects.'],
    ['Karan Arora','karan.arora@creatrhub.demo','Urban Brew Co.','Consumer brand hiring creative talent for campaigns, social media and launch content.'],
    ['Nidhi Shah','nidhi.shah@creatrhub.demo','FrameHouse Media','Media team working on digital campaigns and creator-led content.']
  ];
  const insertClient=db.prepare('INSERT OR IGNORE INTO users(name,email,password_hash,role) VALUES(?,?,?,?)');
  const insertClientProfile=db.prepare('INSERT OR IGNORE INTO client_profiles(user_id,company,bio,social_url) VALUES(?,?,?,?)');
  const clientRatings=[4.8,4.9,4.7,4.9];
  const clientReviewCounts=[21,17,12,26];
  for(let i=0;i<clients.length;i++){
    const c=clients[i];
    const info=insertClient.run(c[0],c[1],passwordHash,'client');
    const u=db.prepare('SELECT id FROM users WHERE email=?').get(c[1]);
    if(info.changes) insertClientProfile.run(u.id,c[2],c[3],'https://example.com/creatrhub-client/'+u.id);
    db.prepare('UPDATE client_profiles SET rating=?, rating_count=? WHERE user_id=?').run(clientRatings[i],clientReviewCounts[i],u.id);
  }
  const posts=[
    ['Rahul Khanna','rahul.khanna@creatrhub.demo','SaaS dashboard UI/UX redesign','UI/UX Designer','Freelance','We need a designer to refresh our SaaS dashboard, improve navigation and create a small reusable design system.','₹35,000 – ₹60,000'],
    ['Simran Kapoor','simran.kapoor@creatrhub.demo','Brand identity for a new lifestyle brand','Graphic Designer','Project-based','Looking for a graphic designer to create a logo direction, typography, colour system and a few launch assets.','₹25,000 – ₹45,000'],
    ['Karan Arora','karan.arora@creatrhub.demo','30 short-form videos for social media','Video Editor','Monthly','Need a fast editor for Instagram Reels and YouTube Shorts. Strong pacing, captions and trend-aware cuts are preferred.','₹30,000/month'],
    ['Nidhi Shah','nidhi.shah@creatrhub.demo','Product launch motion graphics','VFX Artist','Project-based','We need motion/VFX support for a product launch film, including compositing, screen replacements and polished effects.','₹40,000 – ₹75,000'],
    ['Rahul Khanna','rahul.khanna@creatrhub.demo','Mobile app onboarding experience','UI/UX Designer','Contract','Design a simple onboarding flow for a finance app with clear user journeys and high-fidelity mobile screens.','₹20,000 – ₹35,000'],
    ['Simran Kapoor','simran.kapoor@creatrhub.demo','YouTube channel editing partner','Video Editor','Ongoing','Looking for an editor for weekly long-form videos with clean storytelling, sound design, b-roll and engaging pacing.','₹8,000 – ₹15,000/video'],
    ['Karan Arora','karan.arora@creatrhub.demo','Social campaign creatives','Graphic Designer','Freelance','Need a designer for a month-long campaign: posts, stories, ad creatives and a few promotional banners.','₹18,000 – ₹30,000'],
    ['Nidhi Shah','nidhi.shah@creatrhub.demo','3D product visuals for an ad','VFX Artist','Project-based','Create a set of premium 3D product shots and short animated loops for paid advertising and social media.','₹30,000 – ₹55,000']
  ];
  const insertPost=db.prepare('INSERT INTO community_posts(client_user_id,title,category,project_type,description,budget) VALUES(?,?,?,?,?,?)');
  for(const post of posts){
    const client=db.prepare('SELECT id FROM users WHERE email=?').get(post[1]);
    const exists=db.prepare('SELECT id FROM community_posts WHERE client_user_id=? AND title=?').get(client.id,post[2]);
    if(!exists) insertPost.run(client.id,post[2],post[3],post[4],post[5],post[6]);
  }
  // A few fictional demo responses make the Community feel alive and let clients see creator ratings immediately.
  const demoResponses=[
    ['SaaS dashboard UI/UX redesign','rohan.kapoor@creatrhub.demo','I am interested in this project. I have 7 years of product design experience and would love to discuss the dashboard goals.'],
    ['Brand identity for a new lifestyle brand','aditya.verma@creatrhub.demo','Yes, I am ready to work on this. I can help shape the brand identity, typography and launch assets.'],
    ['30 short-form videos for social media','arjun.bhatia@creatrhub.demo','I am ready to take this on. I specialise in high-retention Reels and Shorts with fast turnaround.'],
    ['Product launch motion graphics','yash.thakur@creatrhub.demo','I would love to work on this launch film. I can handle compositing, cleanup and polished VFX.'],
    ['Mobile app onboarding experience','ishita.sharma@creatrhub.demo','I am interested and can help design the onboarding flow and high-fidelity mobile screens.'],
    ['YouTube channel editing partner','vikram.singh@creatrhub.demo','I am ready to discuss the channel style and can handle long-form storytelling, sound and b-roll.'],
    ['Social campaign creatives','priya.nair@creatrhub.demo','I am interested in the campaign. I can create a consistent set of social posts, stories and ad creatives.'],
    ['3D product visuals for an ad','kavya.menon@creatrhub.demo','I am ready to work on the product visuals and animated loops. Happy to discuss references and deliverables.']
  ];
  const insertMessage=db.prepare('INSERT INTO community_messages(post_id,client_user_id,creator_user_id,message) VALUES(?,?,?,?)');
  for(const r of demoResponses){
    const post=db.prepare('SELECT id,client_user_id FROM community_posts WHERE title=?').get(r[0]);
    const creator=db.prepare('SELECT id FROM users WHERE email=?').get(r[1]);
    if(post && creator){
      const exists=db.prepare('SELECT id FROM community_messages WHERE post_id=? AND creator_user_id=?').get(post.id,creator.id);
      if(!exists) insertMessage.run(post.id,post.client_user_id,creator.id,r[2]);
    }
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS meetings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 requester_id INTEGER NOT NULL,
 receiver_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 purpose TEXT NOT NULL DEFAULT '',
 meeting_date TEXT NOT NULL,
 duration INTEGER NOT NULL,
 meeting_type TEXT NOT NULL DEFAULT 'video',
 status TEXT NOT NULL DEFAULT 'pending',
 zoom_meeting_id TEXT DEFAULT '',
 join_url TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_meetings_requester ON meetings(requester_id,status);
CREATE INDEX IF NOT EXISTS idx_meetings_receiver ON meetings(receiver_id,status);
`);

seedDemoData();

app.use(express.json({limit:'200kb'}));
app.use(express.static(path.join(__dirname,'public')));

function sign(user){return jwt.sign({id:user.id,email:user.email,role:user.role},JWT_SECRET,{expiresIn:'7d'});}
function auth(req,res,next){const h=req.headers.authorization||'';const token=h.startsWith('Bearer ')?h.slice(7):null;if(!token)return res.status(401).json({error:'Please log in first.'});try{req.user=jwt.verify(token,JWT_SECRET);next();}catch(e){return res.status(401).json({error:'Your session has expired. Please log in again.'});}}
function publicUser(u){return {id:u.id,name:u.name,email:u.email,role:u.role};}
function safeJson(v){try{return JSON.parse(v||'{}')}catch{return {}}}
function creatorData(id){
  return db.prepare(`SELECT u.id,u.name,u.email,p.category,p.experience_years,p.qualifications,p.skills,p.bio,p.portfolio_url,p.social_url,p.socials_json,p.sample_works,p.work_mode,p.expected_salary,p.hourly_rate,p.verified,p.rating,p.rating_count
    FROM users u JOIN creator_profiles p ON p.user_id=u.id WHERE u.id=? AND u.role='creator'`).get(id);
}
function clientData(id){return db.prepare(`SELECT u.id,u.name,u.email,cp.company,cp.bio,cp.social_url,cp.rating,cp.rating_count FROM users u LEFT JOIN client_profiles cp ON cp.user_id=u.id WHERE u.id=? AND u.role='client'`).get(id);}

app.post('/api/auth/register',async(req,res)=>{
  const {name,email,password,role='creator',category='UI/UX Designer',portfolio=''}=req.body||{};
  if(!name||!email||!password)return res.status(400).json({error:'Name, email and password are required.'});
  if(password.length<8)return res.status(400).json({error:'Password must be at least 8 characters.'});
  if(!['creator','client'].includes(role))return res.status(400).json({error:'Invalid account type.'});
  try{
    const hash=await bcrypt.hash(password,12); const info=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(name.trim(),email.trim().toLowerCase(),hash,role);
    const user=db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(info.lastInsertRowid);
    if(role==='creator')db.prepare('INSERT INTO creator_profiles(user_id,category,portfolio_url) VALUES(?,?,?)').run(user.id,category,portfolio||'');
    else db.prepare('INSERT INTO client_profiles(user_id) VALUES(?)').run(user.id);
    res.status(201).json({message:'Account created successfully.',token:sign(user),user:publicUser(user)});
  }catch(e){if(String(e.message).includes('UNIQUE'))return res.status(409).json({error:'An account with this email already exists. Please log in.'});console.error(e);res.status(500).json({error:'Could not create account.'});}
});

app.post('/api/auth/login',async(req,res)=>{const {email,password,role}=req.body||{};if(!email||!password)return res.status(400).json({error:'Email and password are required.'});if(role&&!['creator','client'].includes(role))return res.status(400).json({error:'Invalid account type.'});const user=db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({error:'Incorrect email or password.'});if(role&&user.role!==role)return res.status(403).json({error:`This account is registered as a ${user.role==='creator'?'Creator / Editor':'Client / Hirer'}. Choose the correct account type.`});res.json({message:'Login successful.',token:sign(user),user:publicUser(user)});});

app.get('/api/me',auth,(req,res)=>{const user=db.prepare('SELECT id,name,email,role,created_at FROM users WHERE id=?').get(req.user.id);if(!user)return res.status(404).json({error:'User not found.'});res.json({user:publicUser(user)});});

app.get('/api/creators',(req,res)=>{
  const {category='All',search=''}=req.query; let sql=`SELECT u.id,u.name,p.category,p.experience_years,p.qualifications,p.skills,p.bio,p.portfolio_url,p.social_url,p.socials_json,p.sample_works,p.work_mode,p.expected_salary,p.hourly_rate,p.verified,p.rating,p.rating_count FROM users u JOIN creator_profiles p ON p.user_id=u.id WHERE u.role='creator'`; const args=[];
  if(category&&category!=='All'){sql+=' AND p.category=?';args.push(category);} if(search){sql+=` AND lower(u.name||' '||p.category||' '||p.skills||' '||p.qualifications||' '||p.bio) LIKE ?`;args.push('%'+String(search).toLowerCase()+'%');} sql+=' ORDER BY p.verified DESC,u.id DESC';
  const rows=db.prepare(sql).all(...args).map(c=>({...c,socials:safeJson(c.socials_json),sampleWorks:(c.sample_works||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}));res.json({creators:rows});
});
app.get('/api/community/posts',(req,res)=>{
  try{
    const category=String(req.query.category||'All');
    let sql=`SELECT cp.id,cp.client_user_id,cp.title,cp.category,cp.project_type,cp.description,cp.budget,cp.created_at,u.name AS client_name,cl.company,cl.bio,cl.social_url,cl.rating AS client_rating,cl.rating_count AS client_rating_count FROM community_posts cp JOIN users u ON u.id=cp.client_user_id LEFT JOIN client_profiles cl ON cl.user_id=cp.client_user_id WHERE 1=1`;
    const args=[];
    if(category && category!=='All'){sql+=' AND cp.category=?';args.push(category);}
    sql+=' ORDER BY cp.id DESC';
    const posts=db.prepare(sql).all(...args);
    const counts=db.prepare('SELECT post_id,COUNT(*) AS responses FROM community_messages GROUP BY post_id').all();
    const countMap=Object.fromEntries(counts.map(x=>[x.post_id,x.responses]));
    res.json({posts:posts.map(p=>({...p,response_count:countMap[p.id]||0}))});
  }catch(e){console.error('Community list error:',e);res.status(500).json({error:'Could not load community projects.'});}
});

app.post('/api/community/posts',auth,(req,res)=>{
  if(req.user.role!=='client')return res.status(403).json({error:'Only client accounts can post projects in Community.'});
  const b=req.body||{};
  const title=String(b.title||'').trim(), category=String(b.category||'').trim(), description=String(b.description||'').trim();
  if(!title||!category||!description)return res.status(400).json({error:'Project title, category and description are required.'});
  if(title.length>120||description.length>1000)return res.status(400).json({error:'Please keep the project title and description concise.'});
  const info=db.prepare('INSERT INTO community_posts(client_user_id,title,category,project_type,description,budget) VALUES(?,?,?,?,?,?)').run(req.user.id,title,category,String(b.project_type||'').trim(),description,String(b.budget||'').trim());
  res.status(201).json({message:'Your project is now live in Community.',postId:info.lastInsertRowid});
});

app.get('/api/community/posts/:id',auth,(req,res)=>{
  const post=db.prepare(`SELECT cp.id,cp.client_user_id,cp.title,cp.category,cp.project_type,cp.description,cp.budget,cp.created_at,u.name AS client_name,cl.company,cl.bio,cl.social_url,cl.rating AS client_rating,cl.rating_count AS client_rating_count FROM community_posts cp JOIN users u ON u.id=cp.client_user_id LEFT JOIN client_profiles cl ON cl.user_id=cp.client_user_id WHERE cp.id=?`).get(req.params.id);
  if(!post)return res.status(404).json({error:'Community project not found.'});
  const responses=db.prepare(`SELECT cm.id,cm.creator_user_id,cm.message,cm.created_at,u.name AS creator_name,cr.rating AS creator_rating,cr.rating_count AS creator_rating_count FROM community_messages cm JOIN users u ON u.id=cm.creator_user_id JOIN creator_profiles cr ON cr.user_id=cm.creator_user_id WHERE cm.post_id=? ORDER BY cm.id DESC`).all(post.id);
  res.json({post,responses});
});

app.post('/api/community/posts/:id/messages',auth,(req,res)=>{
  if(req.user.role!=='creator')return res.status(403).json({error:'Only creators/editors can respond to Community projects.'});
  const post=db.prepare('SELECT id,client_user_id,title FROM community_posts WHERE id=?').get(req.params.id);
  if(!post)return res.status(404).json({error:'Community project not found.'});
  const message=String(req.body?.message||'').trim();
  if(!message)return res.status(400).json({error:'Write a short message before sending.'});
  if(message.length>600)return res.status(400).json({error:'Message is too long. Keep it under 600 characters.'});
  const existing=db.prepare('SELECT id FROM community_messages WHERE post_id=? AND creator_user_id=?').get(post.id,req.user.id);
  if(existing)return res.status(409).json({error:'You have already messaged this client about this project.'});
  const info=db.prepare('INSERT INTO community_messages(post_id,client_user_id,creator_user_id,message) VALUES(?,?,?,?)').run(post.id,post.client_user_id,req.user.id,message);
  emitUser(post.client_user_id,'notification:new',{type:'community_message',postId:post.id,messageId:info.lastInsertRowid});
  res.status(201).json({message:'Message sent to the client.',postId:post.id});
});

app.get('/api/community/my-posts',auth,(req,res)=>{
  if(req.user.role!=='client')return res.status(403).json({error:'Client account required.'});
  const posts=db.prepare(`SELECT cp.*, (SELECT COUNT(*) FROM community_messages cm WHERE cm.post_id=cp.id) AS response_count FROM community_posts cp WHERE cp.client_user_id=? ORDER BY cp.id DESC`).all(req.user.id);
  res.json({posts});
});

app.get('/api/creators/:id',(req,res)=>{const c=creatorData(req.params.id);if(!c)return res.status(404).json({error:'Creator not found.'});c.socials=safeJson(c.socials_json);c.sampleWorks=(c.sample_works||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);delete c.socials_json;delete c.sample_works;res.json({creator:c});});

app.put('/api/creator-profile',auth,(req,res)=>{
  if(req.user.role!=='creator')return res.status(403).json({error:'Creator account required.'});
  const b=req.body||{}; const category=String(b.category||'UI/UX Designer'); const exp=Math.max(0,parseInt(b.experience_years,10)||0);
  const socials={instagram:String(b.instagram||''),linkedin:String(b.linkedin||''),behance:String(b.behance||''),website:String(b.website||'')};
  db.prepare(`UPDATE creator_profiles SET category=?,experience_years=?,qualifications=?,skills=?,bio=?,portfolio_url=?,social_url=?,socials_json=?,sample_works=?,work_mode=?,expected_salary=?,hourly_rate=? WHERE user_id=?`).run(category,exp,String(b.qualifications||''),String(b.skills||''),String(b.bio||''),String(b.portfolio_url||''),String(b.social_url||''),JSON.stringify(socials),String(b.sample_works||''),String(b.work_mode||'Part-time'),String(b.expected_salary||''),Math.max(0,parseInt(b.hourly_rate,10)||0),req.user.id);
  const savedCreator=creatorData(req.user.id);
  const publicCreator={...savedCreator}; delete publicCreator.email;
  io.emit('profile:updated', { creatorId:req.user.id, creator:publicCreator });
  res.json({message:'Creator profile saved.',creator:savedCreator});
});
app.get('/api/creator-profile',auth,(req,res)=>{if(req.user.role!=='creator')return res.status(403).json({error:'Creator account required.'});const c=creatorData(req.user.id);c.socials=safeJson(c.socials_json);res.json({creator:c});});

app.put('/api/client-profile',auth,(req,res)=>{if(req.user.role!=='client')return res.status(403).json({error:'Client account required.'});const b=req.body||{};db.prepare(`INSERT INTO client_profiles(user_id,company,bio,social_url) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET company=excluded.company,bio=excluded.bio,social_url=excluded.social_url`).run(req.user.id,String(b.company||''),String(b.bio||''),String(b.social_url||''));res.json({message:'Client profile saved.',client:clientData(req.user.id)});});
app.get('/api/client-profile',auth,(req,res)=>{if(req.user.role!=='client')return res.status(403).json({error:'Client account required.'});res.json({client:clientData(req.user.id)});});

app.post('/api/hiring-requests',auth,(req,res)=>{
  try{
    if(req.user.role!=='client')return res.status(403).json({error:'Only client accounts can send hiring requests.'});
    const creatorId=Number(req.body?.creatorId);
    if(!Number.isInteger(creatorId)||creatorId<1)return res.status(400).json({error:'Invalid creator selected.'});

    const creator=db.prepare("SELECT u.id,u.name FROM users u JOIN creator_profiles p ON p.user_id=u.id WHERE u.id=? AND u.role='creator'").get(creatorId);
    if(!creator)return res.status(404).json({error:'Creator not found. Please refresh the creators list and try again.'});

    // Make sure older CreatrHub databases have the client profile needed by the hiring flow.
    const clientUser=db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(req.user.id);
    if(!clientUser || clientUser.role!=='client')return res.status(401).json({error:'Client account not found. Please log in again.'});
    db.prepare('INSERT OR IGNORE INTO client_profiles(user_id) VALUES(?)').run(req.user.id);
    const client=clientData(req.user.id);
    if(!client)return res.status(500).json({error:'Your client profile could not be loaded. Please restart CreatrHub and try again.'});

    const existing=db.prepare(`SELECT id FROM hiring_requests WHERE client_user_id=? AND creator_user_id=? AND status='pending'`).get(req.user.id,creator.id);
    if(existing)return res.status(409).json({error:'You already have a pending request with this creator.'});

    const info=db.prepare('INSERT INTO hiring_requests(client_user_id,creator_user_id,client_name,client_email,contact_url,status) VALUES(?,?,?,?,?,?)').run(req.user.id,creator.id,client.name,client.email,client.social_url||'','pending');
    emitUser(creator.id,'notification:new',{type:'hire',requestId:info.lastInsertRowid});
    res.status(201).json({message:`${creator.name} will reach out to you shortly.`,requestId:info.lastInsertRowid});
  }catch(e){
    console.error('Hiring request error:',e);
    const detail=String(e?.message||'');
    if(detail.includes('UNIQUE')) return res.status(409).json({error:'You already have a hiring request with this creator.'});
    if(detail.includes('FOREIGN KEY')) return res.status(400).json({error:'This creator or client account is no longer available. Please refresh and try again.'});
    res.status(500).json({error:'Could not send the hiring request. '+(detail||'Please restart the CreatrHub server and try again.')});
  }
});

app.get('/api/notifications',auth,(req,res)=>{
  if(req.user.role==='creator'){
    const hiring=db.prepare(`SELECT h.id,h.status,h.created_at,h.client_user_id,h.client_name,h.client_email,h.contact_url FROM hiring_requests h WHERE h.creator_user_id=? ORDER BY h.id DESC`).all(req.user.id).map(r=>({...r,type:'hire',message:`${r.client_name} wants to hire you.`}));
    const community=db.prepare(`SELECT cm.id,cm.created_at,cm.client_user_id,cm.post_id,cm.message,u.name AS client_name,cp.title FROM community_messages cm JOIN users u ON u.id=cm.client_user_id JOIN community_posts cp ON cp.id=cm.post_id WHERE cm.creator_user_id=? ORDER BY cm.id DESC`).all(req.user.id).map(r=>({...r,type:'community_response',message:`${r.client_name} received your Community response.`}));
    return res.json({notifications:[...hiring,...community].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))});
  }
  const hiring=db.prepare(`SELECT h.id,h.status,h.created_at,h.creator_user_id,u.name AS creator_name FROM hiring_requests h JOIN users u ON u.id=h.creator_user_id WHERE h.client_user_id=? ORDER BY h.id DESC`).all(req.user.id).map(r=>({...r,type:'hire',message:`${r.creator_name} will reach out to you shortly.`}));
  const community=db.prepare(`SELECT cm.id,cm.created_at,cm.creator_user_id,cm.post_id,cm.message,u.name AS creator_name,cp.title FROM community_messages cm JOIN users u ON u.id=cm.creator_user_id JOIN community_posts cp ON cp.id=cm.post_id WHERE cm.client_user_id=? ORDER BY cm.id DESC`).all(req.user.id).map(r=>({...r,type:'community_message',message:`${r.creator_name} is ready to work on your project.`}));
  const meetings=db.prepare(`SELECT m.id,m.status,m.created_at,m.requester_id,m.receiver_id,a.name AS requester_name,b.name AS receiver_name,m.title FROM meetings m JOIN users a ON a.id=m.requester_id JOIN users b ON b.id=m.receiver_id WHERE m.requester_id=? OR m.receiver_id=? ORDER BY m.id DESC`).all(req.user.id,req.user.id).map(m=>({...m,type:'meeting',message:m.receiver_id===req.user.id?`${m.requester_name} sent you a meeting request: ${m.title}`:`Meeting with ${m.receiver_name}: ${m.title} (${m.status})`}));
  res.json({notifications:[...hiring,...community,...meetings].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))});
});


async function createZoomMeeting(meeting, hostEmail) {
  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    throw new Error('Zoom is not configured. Add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET to .env, then restart CreatrHub.');
  }
  const basic = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const tokenResp = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(ZOOM_ACCOUNT_ID)}`, {
    method:'POST', headers:{Authorization:`Basic ${basic}`}
  });
  const tokenData = await tokenResp.json();
  if (!tokenResp.ok || !tokenData.access_token) throw new Error(tokenData.reason || tokenData.message || 'Zoom authentication failed. Check Server-to-Server OAuth credentials and scopes.');
  const host = process.env.ZOOM_HOST_USER || hostEmail || 'me';
  const start = new Date(meeting.meeting_date);
  const zoomResp = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(host)}/meetings`, {
    method:'POST',
    headers:{Authorization:`Bearer ${tokenData.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      topic:meeting.title,
      type:2,
      start_time:start.toISOString(),
      duration:meeting.duration,
      timezone:'Asia/Kolkata',
      agenda:meeting.purpose || '',
      settings:{join_before_host:false,waiting_room:true,approval_type:2}
    })
  });
  const zoomData = await zoomResp.json();
  if (!zoomResp.ok || !zoomData.join_url) throw new Error(zoomData.message || 'Zoom could not create the meeting. Check app scopes and host permissions.');
  return {id:String(zoomData.id),join_url:zoomData.join_url};
}
function meetingForUser(id,userId) {
 return db.prepare(`SELECT m.*, a.name AS requester_name, a.role AS requester_role,
 b.name AS receiver_name, b.role AS receiver_role
 FROM meetings m JOIN users a ON a.id=m.requester_id JOIN users b ON b.id=m.receiver_id
 WHERE m.id=? AND (m.requester_id=? OR m.receiver_id=?)`).get(id,userId,userId);
}
app.get('/api/meeting-contacts',auth,(req,res)=>{
 const role=req.user.role==='client'?'creator':'client';
 const rows=db.prepare('SELECT id,name,role FROM users WHERE role=? AND id<>? ORDER BY name').all(role,req.user.id);
 res.json({contacts:rows});
});
app.post('/api/meetings',auth,async(req,res)=>{
 try {
  if(req.user.role!=='client') return res.status(403).json({error:'Only clients can request a meeting from a creator profile.'});
  const {receiverId,title,purpose='',meetingDate,duration=30,meetingType='video'}=req.body||{};
  const receiver=db.prepare('SELECT id,name,role,email FROM users WHERE id=?').get(Number(receiverId));
  if(!receiver||receiver.role!=='creator') return res.status(404).json({error:'Creator profile not found.'});
  if(!title||!String(title).trim()||!meetingDate) return res.status(400).json({error:'Meeting title and date/time are required.'});
  if(![15,30,45,60].includes(Number(duration))) return res.status(400).json({error:'Choose a duration of 15, 30, 45 or 60 minutes.'});
  if(!['video','audio'].includes(meetingType)) return res.status(400).json({error:'Choose video or audio meeting type.'});
  const dt=new Date(meetingDate);
  if(Number.isNaN(dt.getTime())||dt.getTime()<=Date.now()) return res.status(400).json({error:'Choose a future date and time.'});
  const start=dt.toISOString();
  const overlap=db.prepare(`SELECT id FROM meetings WHERE status='confirmed' AND (requester_id IN (?,?) OR receiver_id IN (?,?)) AND datetime(meeting_date) < datetime(?, '+'||duration||' minutes') AND datetime(meeting_date, '+'||duration||' minutes') > datetime(?)`).get(req.user.id,receiver.id,req.user.id,receiver.id,start,start);
  if(overlap) return res.status(409).json({error:'One of the participants already has a confirmed meeting at that time.'});
  const info=db.prepare('INSERT INTO meetings(requester_id,receiver_id,title,purpose,meeting_date,duration,meeting_type,status) VALUES(?,?,?,?,?,?,?,?)').run(req.user.id,receiver.id,String(title).trim(),String(purpose).trim(),start,Number(duration),meetingType,'pending');
  const createdMeeting=meetingForUser(info.lastInsertRowid,req.user.id);
  emitUser(receiver.id,'meeting:request',{id:createdMeeting.id,requester_id:createdMeeting.requester_id,receiver_id:createdMeeting.receiver_id,title:createdMeeting.title,status:createdMeeting.status,created_at:createdMeeting.created_at});
  emitUser(receiver.id,'notification:new',{type:'meeting',meetingId:createdMeeting.id,status:'pending'});
  res.status(201).json({message:`Meeting request sent to ${receiver.name}.`,meeting:createdMeeting});
 } catch(e){console.error('Create meeting:',e);res.status(500).json({error:e.message||'Could not send meeting request.'});}
});
app.get('/api/meetings',auth,(req,res)=>{
 const rows=db.prepare(`SELECT m.*,a.name AS requester_name,a.role AS requester_role,b.name AS receiver_name,b.role AS receiver_role
 FROM meetings m JOIN users a ON a.id=m.requester_id JOIN users b ON b.id=m.receiver_id
 WHERE m.requester_id=? OR m.receiver_id=? ORDER BY datetime(m.meeting_date) ASC,m.id DESC`).all(req.user.id,req.user.id);
 const visibleRows=rows.map(m=>req.user.role==='client'&&m.requester_id===req.user.id&&m.status!=='confirmed'
  ? {...m,title:'Meeting request',purpose:'',meeting_date:null,duration:null,meeting_type:'',zoom_meeting_id:'',join_url:''}
  : m);
 res.json({meetings:visibleRows});
});
app.patch('/api/meetings/:id/accept',auth,async(req,res)=>{
 try{
  const m=meetingForUser(Number(req.params.id),req.user.id);
  if(!m)return res.status(404).json({error:'Meeting not found.'});
  if(m.receiver_id!==req.user.id)return res.status(403).json({error:'Only the person receiving this request can accept it.'});
  if(m.status!=='pending'&&m.status!=='reschedule_requested')return res.status(409).json({error:'This meeting request is no longer pending.'});
  const host=db.prepare('SELECT email FROM users WHERE id=?').get(m.receiver_id);
  const zoom=await createZoomMeeting(m,host.email);
  db.prepare("UPDATE meetings SET status='confirmed',zoom_meeting_id=?,join_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(zoom.id,zoom.join_url,m.id);
  const confirmed=meetingForUser(m.id,req.user.id); emitMeeting(confirmed,'meeting:confirmed');
  res.json({message:'Meeting confirmed. Zoom link is ready.',meeting:confirmed});
 }catch(e){console.error('Accept meeting:',e);res.status(502).json({error:e.message||'Could not create the Zoom meeting.'});}
});
app.patch('/api/meetings/:id/reject',auth,(req,res)=>{
 const m=meetingForUser(Number(req.params.id),req.user.id);if(!m)return res.status(404).json({error:'Meeting not found.'});
 if(!(m.receiver_id===req.user.id&&m.status==='pending')&&!(m.requester_id===req.user.id&&m.status==='reschedule_requested'))return res.status(403).json({error:'You cannot reject this meeting request.'});
 if(!['pending','reschedule_requested'].includes(m.status))return res.status(409).json({error:'This meeting can no longer be rejected.'});
 db.prepare("UPDATE meetings SET status='rejected',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(m.id);emitMeeting(meetingForUser(m.id,req.user.id),'meeting:rejected');res.json({message:'Meeting request rejected.'});
});
app.patch('/api/meetings/:id/reschedule',auth,async(req,res)=>{
 try{
  const m=meetingForUser(Number(req.params.id),req.user.id);
  if(!m)return res.status(404).json({error:'Meeting not found.'});
  if(m.receiver_id!==req.user.id||req.user.role!=='creator')return res.status(403).json({error:'Only the creator receiving this request can reschedule it.'});
  if(m.status!=='pending')return res.status(409).json({error:'Only a pending meeting request can be rescheduled.'});
  const {meetingDate,title=m.title,purpose=m.purpose,duration=m.duration,meetingType=m.meeting_type}=req.body||{};
  if(!meetingDate||!String(title).trim())return res.status(400).json({error:'Meeting title and date/time are required.'});
  if(![15,30,45,60].includes(Number(duration)))return res.status(400).json({error:'Choose a duration of 15, 30, 45 or 60 minutes.'});
  if(!['video','audio'].includes(meetingType))return res.status(400).json({error:'Choose video or audio meeting type.'});
  const dt=new Date(meetingDate);
  if(Number.isNaN(dt.getTime())||dt.getTime()<=Date.now())return res.status(400).json({error:'Choose a future date and time.'});
  const start=dt.toISOString();
  const overlap=db.prepare(`SELECT id FROM meetings WHERE id<>? AND status='confirmed' AND (requester_id IN (?,?) OR receiver_id IN (?,?)) AND datetime(meeting_date) < datetime(?, '+'||duration||' minutes') AND datetime(meeting_date, '+'||duration||' minutes') > datetime(?)`).get(m.id,m.requester_id,m.receiver_id,m.requester_id,m.receiver_id,start,start);
  if(overlap)return res.status(409).json({error:'One of the participants already has a confirmed meeting at that time.'});
  const updated={...m,title:String(title).trim(),purpose:String(purpose||'').trim(),meeting_date:start,duration:Number(duration),meeting_type:meetingType};
  const host=db.prepare('SELECT email FROM users WHERE id=?').get(m.receiver_id);
  const zoom=await createZoomMeeting(updated,host.email);
  db.prepare("UPDATE meetings SET title=?,purpose=?,meeting_date=?,duration=?,meeting_type=?,status='confirmed',zoom_meeting_id=?,join_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(updated.title,updated.purpose,updated.meeting_date,updated.duration,updated.meeting_type,zoom.id,zoom.join_url,m.id);
  const rescheduled=meetingForUser(m.id,req.user.id); emitMeeting(rescheduled,'meeting:rescheduled');
  res.json({message:'Rescheduled meeting confirmed. Updated details and Zoom link are now available to the client.',meeting:rescheduled});
 }catch(e){console.error('Reschedule meeting:',e);res.status(502).json({error:e.message||'Could not create the rescheduled Zoom meeting.'});}
});

app.patch('/api/meetings/:id/approve-reschedule',auth,async(req,res)=>{
 try{
  const m=meetingForUser(Number(req.params.id),req.user.id);if(!m)return res.status(404).json({error:'Meeting not found.'});
  if(m.requester_id!==req.user.id||m.status!=='reschedule_requested')return res.status(403).json({error:'Only the requester can approve this proposed time.'});
  const host=db.prepare('SELECT email FROM users WHERE id=?').get(m.requester_id);
  const zoom=await createZoomMeeting(m,host.email);
  db.prepare("UPDATE meetings SET status='confirmed',zoom_meeting_id=?,join_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(zoom.id,zoom.join_url,m.id);
  res.json({message:'Rescheduled meeting confirmed. New Zoom link is ready.'});
 }catch(e){res.status(502).json({error:e.message||'Could not create the rescheduled Zoom meeting.'});}
});
app.patch('/api/meetings/:id/cancel',auth,(req,res)=>{
 const m=meetingForUser(Number(req.params.id),req.user.id);if(!m)return res.status(404).json({error:'Meeting not found.'});
 if(!['pending','reschedule_requested','confirmed'].includes(m.status))return res.status(409).json({error:'This meeting cannot be cancelled.'});
 db.prepare("UPDATE meetings SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(m.id);res.json({message:'Meeting cancelled.'});
});

app.get('/api/hirers/:id',auth,(req,res)=>{if(req.user.role!=='creator')return res.status(403).json({error:'Creator account required.'});const allowed=db.prepare('SELECT id FROM hiring_requests WHERE creator_user_id=? AND client_user_id=? LIMIT 1').get(req.user.id,req.params.id) || db.prepare('SELECT id FROM community_messages WHERE creator_user_id=? AND client_user_id=? LIMIT 1').get(req.user.id,req.params.id);if(!allowed)return res.status(403).json({error:'You can only view the profile of a client who contacted you.'});const client=clientData(req.params.id);if(!client)return res.status(404).json({error:'Client not found.'});res.json({client});});

app.use((req,res,next)=>{if(req.method==='GET'&&!req.path.startsWith('/api/'))return res.sendFile(path.join(__dirname,'public','index.html'));next();});
server.listen(PORT,()=>console.log(`CreatrHub running at http://localhost:${PORT}`));
