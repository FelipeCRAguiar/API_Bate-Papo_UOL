import express, { json } from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from 'cors';
import dayjs from "dayjs";
import joi from 'joi';
import dotenv from "dotenv";
dotenv.config();


const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
mongoClient.connect(() => {
  db = mongoClient.db("api_bate_papo_uol");
});

const app = express();
app.use(cors());
app.use(json());

app.post("/participants", async (req, res) => {
    const userSchema = joi.object().keys({
        name: joi.string().required(),
    });

    const validation = userSchema.validate(req.body, { abortEarly: false });
    if (validation.error) {
        res.status(422).send(validation.error.details.map(error => error.message));
        return;
    }

    const user = { ...req.body, lastStatus: Date.now() };

    const allUsers = await db.collection("participants").find({}).toArray();
    for (let participant of allUsers) {
        if (participant.name === user.name) {
            res.sendStatus(409);
            return;
        }
    }
  
    try {
        await db.collection("participants").insertOne(participant);
        await db.collection("messages").insertOne({
            from: user.name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: dayjs(user.lastStatus).format("HH:mm:ss"),
        });
        res.sendStatus(201);
    } catch (error) {
        res.sendStatus(500);
    }
});

app.get("/participants", async (req, res) => {
    try {
        const users = await db.collection("participants").find({}).toArray();
        res.send(users);
    } catch (error) {
        res.sendStatus(500);
    }
});

app.post('/messages', async (req, res) => {
    try {
        const from = req.header('User');
        const message = { from, ...req.body };
        const loggedUsers = await db.collection('users').find({}).toArray();
        const loggedUsernames = loggedUsers.map(user => user.name);
  
        const messageSchema = joi.object({
            from: joi.string().valid( ...loggedUsernames ).required(),
            to: joi.string().required(),
            text: joi.string().required(),
            type: joi.string().valid('message', 'private_message').required()
        });
        const validation = messageSchema.validate(message, { abortEarly: false });
        if (validation.error) {
            res.status(422).send(validation.error.details.map(error => error.message));
            return;
        }
  
        message.time = dayjs(Date.now()).format('HH:mm:ss');
      
        await db.collection('messages').insertOne(message);
        res.sendStatus(201);
    } catch (error) {
        console.log(error);
        res.sendStatus(500); 
    }
});

app.get('/messages', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit);
        const currentUser = req.header('User');
        const messages = await db.collection('messages').find({}).toArray();
        const filteredMessages = messages.filter((message) => {
            if (message.type === 'status' || message.type === 'message' || message.from === currentUser || message.to === currentUser){
                return true;
            }
            else {
                return false;
            }
        });
    
        let currentMessages;
        let currentMessagesUser;
        if(limit === NaN){
            currentMessages = filteredMessages.length;
        }else{
            currentMessages = limit;
        }

        currentMessagesUser = filteredMessages.slice(-currentMessages);
        res.send(currentMessagesUser);
    } catch (error) {
        console.log(error);
        res.sendStatus(500); 
    }
});

app.post('/status', async (req, res) => {
    const user = req.header('User');
    if(!user){
        res.sendStatus(400);
        return;
    }
  
    try {
        const loggedUser = await db.collection('users').findOne({ name: user });
        if(!loggedUser){
            res.sendStatus(404);
            return;
        }
  
        await db.collection('users').updateOne({ _id: loggedUser._id  }, { $set: { lastStatus: Date.now() } });
      
        res.sendStatus(200);
        return;
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
        return;
    }
});

setInterval(async () => {
    let timeLimit = Date.now() - 10000;
    try {
        const AFKUsers = await db.collection('users').find({ lastStatus: { $lte: timeLimit } }).toArray();
        if(AFKUsers.length === 0){
            return;
        }
        await db.collection('users').deleteMany({ lastStatus: { $lte: timeLimit } });
  
        let messagesOut = AFKUsers.map(user => {
            let newFormattedMessage = {
                from: user.name,
                to: 'Todos',
                text: 'sai da sala...',
                type: 'status',
                time: dayjs().format('HH:mm:ss')
            }
            return newFormattedMessage;
        })
  
        await db.collection('messages').insertMany([ ...messagesOut ]);
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
}, 15000);
  
  
  
app.listen(5000, () => {
    console.log('Running app in http://localhost:5000');
});
  
  