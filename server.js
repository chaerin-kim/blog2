require('dotenv').config()

const express = require('express')
const app = express()
const port = process.env.PORT

app.set('view engine', 'ejs')
app.use(express.static('public'))

app.use(express.json())
app.use(express.urlencoded({extended:true}))

const { MongoClient } = require('mongodb')
const uri = process.env.MONGO_URL;
const client = new MongoClient(uri)

const fs = require('fs')
const uploadDir = 'public/uploads/'

const multer = require('multer');
const path = require('path');

const methodOverride = require('method-override')
app.use(methodOverride('_method'))

const jwt = require('jsonwebtoken');
const SECRET = process.env.SECRET_KEY //

const cookieParser = require('cookie-parser')
app.use(cookieParser()) // 미들웨어

app.use(async (req, res, next)=>{
    const  token = req.cookies.token

    if (token){
        try{
            const data = jwt.verify(token, SECRET)
            const db = await getDB()
            const user = await db.collection('users').findOne({userid: data.userid})
            req.user = user ? user : null;
            
        }catch(e){
        console.error(e)
        }
    }
    next()
})

if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const getDB = async ()=>{
   await client.connect()
   return client.db('blog')
}

app.get('/', async (req, res)=>{
    try{
        const db = await getDB()
        const posts = await db.collection('posts').find().sort({createAtDate:-1}).limit(6).toArray()
        res.render('index', {posts, user:req.user})
    }catch(e){
        console.error(e);
    }
})

//3개씩 추가되는 포스트 갖고오는 기능
app.get('/getPosts', async(req, res)=>{
    const page = req.query.page || 1
    // const postsPerPage = req.query.postsPerPage || 3
    const postsPerPage =  3
    const skip = 7 + (page - 1) * postsPerPage  //1:0, 2:3

    try{
        const db = await getDB()
        const posts = await db.collection('posts')
            .find()
            .sort({createAtDate:-1})
            .skip(skip)
            .limit(postsPerPage)
            .toArray()
        res.json(posts)
    } catch(e){
        console.error(e)
    }
})

app.get('/write', (req, res)=>{
    res.render('write', {user:req.user})
})

// Multer 설정
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); 
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)); // 파일 이름 설정
    }
});

const upload = multer({ storage: storage });


app.post('/write', upload.single('postimg'), async (req, res) => {
    const { title, content } = req.body;
    const postImg = req.file ? req.file.filename : null;
    const createAtDate = new Date()
    try {
        let db = await getDB();
        const result = await db.collection('counter').findOne({ name: 'counter' });
        await db.collection('posts').insertOne({
            _id: result.totalPost + 1,
            title,
            content,
            createAtDate,
            userid : req.user.userid,
            username: req.user.username,
            postImgPath: postImg ? `/uploads/${postImg}` : null,
        });
        await db.collection('counter').updateOne({ name: 'counter' }, { $inc: { totalPost: 1 } });

        await db.collection('like').insertOne({
            post_id: result.totalPost + 1, 
            likeTotal:0, 
            likeMember: []
        })

        res.redirect('/');
    } catch (error) {
        console.log(error);
    }
});

// 댓글기능개발 /comment/9
app.post('/comment/:id', async (req, res)=>{
    const post_id = parseInt(req.params.id)
    const {comment} = req.body
    const createAtDate = new Date()
    console.log('------------------',post_id);
    console.log('------------------',createAtDate);
    console.log('------------------',comment);

    try{
        const db = await getDB()
        await db.collection('comment').insertOne({
            post_id,
            comment,
            createAtDate,
            userid : req.user.userid,
            username : req.user.username
        })
        res.json({success : true})
    }catch(e){
        console.error(e)
        res.json({success : false})
    }
})

// 디테일 페이지
app.get('/detail/:id',async (req, res)=>{
    let id = parseInt(req.params.id)
    try{
        const db = await getDB()
        const posts = await db.collection('posts').findOne({_id : id})
        const like = await db.collection('like').findOne({post_id : id})
        const comments = await db.collection('comment').find({post_id : id}).sort({createAtDate: -1}).toArray()
        res.render('detail', {posts, user:req.user, like, comments})
    }catch(e){
        console.error(e);
    }
})

//삭제기능
app.post('/delete/:id', async(req, res)=>{
    let id = parseInt(req.params.id)
    try{
        const db = await getDB()
        await db.collection('posts').deleteOne({_id: id})
        res.redirect('/')
    }catch(e){
        console.error(e)
    }
})

// 수정페이지로 데이터 바인딩
app.get('/edit/:id', async(req, res)=>{
    let id = parseInt(req.params.id)
    try{
        const db = await getDB()
        const posts = await db.collection('posts').findOne({_id:id})
        res.render('edit', {posts, user:req.user})
    }catch(e){
        console.error(e);
    }
})

app.post('/edit', upload.single('postimg'), async(req, res)=>{
    const {id, title, content, createAtDate } = req.body
    const postimgOld = req.body.postimgOld.replace('uploads/','')
    const postImg = req.file ? req.file.filename : postimgOld;

    try{
        const db= await getDB()
        await db.collection('posts').updateOne({_id : parseInt(id)},{
            $set : {
                title,
                content,
                createAtDate,
                postImgPath: postImg ? `/uploads/${postImg}` : null,
            }
        })
        res.redirect('/')
    }catch(e){
        console.error(e);
    }
})

app.get('/signup', (req, res)=>{
    res.render('signup', {user:req.user})
})

const bcrypt = require('bcrypt');
const saltRounds = 10;

app.post('/signup', async(req, res)=>{
   const { userid, pw, username } = req.body
   try{
    const hashedPw = await bcrypt.hash(pw, saltRounds) 
    const db = await getDB()
    await db.collection('users').insertOne({userid, username, pw : hashedPw})
    res.redirect('/login')
   }catch(e){
    console.error(e)
   }

})

//로그인 페이지
app.get('/login', (req, res)=>{
    res.render('login', {user:req.user})
})

app.post('/login',async(req, res)=>{
    const {userid, pw }= req.body

    try{
        const db = await getDB()
        const user = await db.collection('users').findOne({userid})

        if(user){
            const compareResult = await bcrypt.compare(pw, user.pw)
            if(compareResult){
                const token = jwt.sign({userid:user.userid}, SECRET) //토근 발행
                res.cookie('token', token)
                res.redirect('/')
            }else{
                res.status(401).send()
            }
        }else{
            res.status(404).send()
        }

    }catch(e){
        console.error(e)
    }
})

app.get('/logout', (req, res)=>{
    res.clearCookie('token')
    res.redirect('/')
})

// 개인페이지 personal
app.get('/personal/:userid', async (req, res)=>{
    const postUser = req.params.userid
    try {
        const db = await getDB()
        const posts = await db.collection('posts').find({userid:postUser}).toArray()
        console.log(postUser, posts);
        res.render('personal', {posts, postUser, user:req.user})
    } catch(e){
        console.error(e)
    }

})

//마이페이지
app.get('/mypage',(req, res)=>{
    res.render('mypage', {user: req.user})
})

// 좋아요 기능
app.post('/like/:id', async (req, res)=>{
    const postid =  parseInt(req.params.id) 
    const userid = req.user.userid 

    try{
        const db = await getDB()
        const like = await db.collection('like').findOne({post_id : postid })
        if (like.likeMember.includes(userid)){ 
            await db.collection('like').updateOne({post_id : postid},{
                $inc : {likeTotal : -1},
                $pull : {likeMember : userid}
            })
        }else{   
            await db.collection('like').updateOne({post_id : postid},{
                $inc : {likeTotal : 1},
                $push : {likeMember : userid}
            })
        }
        res.redirect('/detail/'+ postid)
    }catch(e){
        console.error(e)
    }
})


app.listen(port, ()=>{
    console.log(`잘돌아감 --- ${port}`);
})