const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer')
require('dotenv').config();
const port = process.env.PORT || 5000;

const app = express(); // express start

// middle ware
app.use(cors());
app.use(express.json());

// Database


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ldmt6s4.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function sendBookingEmail() {
    const { email } = booking;
    let transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
            user: "apikey",
            pass: process.env.SENDGRID_API_KEY
        }
    });

    transporter.sendMail({
        from: "SENDER_EMAIL", // verified sender email
        to: email, // recipient email
        subject: `Your appointment for ${treatment}`, // Subject line
        text: "Hello world!", // plain text body
        html: `
        <h3>  Your appointment is confirmed </h3>
        <div>
        <p> Your Treatment ${treatment} </p>
        <p> Please visit us on ${appointDate} at ${slot} </p>
        <p> Please visit us on ${appointDate} at ${slot} </p>
        <p> Thanks from Doctors Portal </p>
        </div>
        
        `

        , // html body
    }, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}

function verifyJWT(req, res, next) {
    console.log('token', req.headers.authorization);
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(403).send('unauthorized access');
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access ' })
        }
        req.decoded = decoded
        next();
    })

}
async function run() {
    try {
        const appointmentOptionCollection = client.db('docPortal').collection('appointmentOptions');
        const bookingsCollection = client.db('docPortal').collection('bookings');
        const usersCollection = client.db('docPortal').collection('users');
        const doctorsCollection = client.db('docPortal').collection('doctors');


        // Aggregate Query to multiple Collection

        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            console.log(date);
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();
            // get the booking
            const bookingQuery = { appointDate: date }
            // console.log(bookingQuery);
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();


            //code carefully 
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
                const bookedSlots = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
                option.slots = remainingSlots;

            })
            res.send(options);
        });

        /**
         * API Naming Conventions
         * bookings
         * app.get('/bookings')
         * app.get('/bookings/:id')
         * app.post('/bookings')
         * app.patch('/bookings/:id')
         * app.delete('/bookings/:id'
         */

        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {}
            const result = await appointmentOptionCollection.find(query).project({ name: 1 }).toArray();
            res.send(result);
        })
        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = { email: email }
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings)
        })
        app.post('/bookings', async (req, res) => {
            const booking = req.body
            console.log(booking);
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();

            if (alreadyBooked.length) {
                const message = `You already Booking on ${booking.appointmentDate}`;
                return res.send({ acknowledged: false, message })
            }

            const result = await bookingsCollection.insertOne(booking);
            // About email sending Info 
            res.send(result);

        });
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                return res.send({ accessToken: token });

            }
            res.status(403).send({ accessToken: '' })

        })
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });

        // Maintence admin
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })


        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);

        });
        app.put('/users/admin/:id', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        // Doctors Information: Api hit this client Site
        app.post('/doctors', async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);

        });



    }
    finally {

    }
}
run().catch(console.log)
    ;

app.get('/', async (req, res) => {
    res.send('Doctors portal Running Server');
})
app.listen(port, () => console.log(`Doctors Portal Running ${port}`));