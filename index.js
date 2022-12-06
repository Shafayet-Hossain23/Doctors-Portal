const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
// console.log(process.env.STRIPE_SECRET_KEY)
// ...midileware
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send('Hello World!')
})

// ...jwt middleware...
function verifyJWT(req, res, next) {
    const authHeader = req?.headers?.authorization
    if (!authHeader) {
        // return res.status(403).send({ message: "unauthorized access" })
        return res.send({ message: "unauthorized access" })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            // return res.status(403).send({ message: "Access forbidden" })
            return res.send({ message: "Access forbidden" })
        }
        req.decoded = decoded
        next()
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.xazyemr.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        const appoinmentOptionsCollection = client.db("doctorsPortal").collection("appoinmentOptions");
        const bookingsCollection = client.db("doctorsPortal").collection("bookings")
        const usersCollection = client.db("doctorsPortal").collection("users")
        const doctorsCollection = client.db("doctorsPortal").collection("doctors")
        const paymentsCollection = client.db("doctorsPortal").collection("payments")

        // NOTE: make sure you use verifyAdmin after verifyJWT
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req?.decoded?.email
            const query = {
                email: decodedEmail
            }
            const currentUser = await usersCollection.findOne(query)
            if (currentUser?.role !== "admin") {
                return res.status(403).send({ message: "Forbidden access" })
            }
            next()
        }
        app.get('/appoinmentOptions', async (req, res) => {
            const date = req.query.date
            // console.log(date)
            const query = {}
            const options = await appoinmentOptionsCollection.find(query).toArray();
            // const options = await cursor.toArray()
            const bookingQuery = { appoinmentDate: date }
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray()
            options.forEach(option => {
                const bookedOption = alreadyBooked.filter(book => book.treatmentName === option.name)
                // console.log(bookedOption)
                const bookedSlots = bookedOption.map(book => book.timeSlot)
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
                option.slots = remainingSlots
                // console.log(remainingSlots)
            })
            res.send(options)
        })
        app.post('/bookings', async (req, res) => {
            const bookingInfo = req.body
            // console.log(bookingInfo)
            const query = {
                email: bookingInfo.email,
                appoinmentDate: bookingInfo.appoinmentDate,
                // treatmentName: bookingInfo.treatmentName
            }
            const bookedOption = await bookingsCollection.find(query).toArray()
            if (bookedOption.length) {
                const message = `You have already booked on ${bookingInfo.appoinmentDate}`
                return res.send({ acknowledged: false, message })
            }
            const result = await bookingsCollection.insertOne(bookingInfo)
            res.send(result)
        })
        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email
            // console.log(email)
            // console.log(req.headers.authorization)
            const decodedEmail = req.decoded.email
            if (email !== decodedEmail) {
                // return res.status(403).send({ message: "Access Forbidden" })
                return res.send({ message: "Access Forbidden" })
            }
            const query = {
                email: email
            }
            const oneUserBookings = await bookingsCollection.find(query).toArray()
            res.send(oneUserBookings)
        })
        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id
            // console.log(id)
            const query = { _id: ObjectId(id) }
            const result = await bookingsCollection.findOne(query)
            res.send(result)
        })
        app.post('/users', async (req, res) => {
            const user = req.body
            // console.log(user)
            const userCollection = await usersCollection.insertOne(user)
            res.send(userCollection)
        })
        app.post('/users/popup', async (req, res) => {
            const user = req.body
            // console.log(user)
            const query = { email: user.email }
            const alreadyAddeduser = await usersCollection.findOne(query)
            if (!alreadyAddeduser) {
                const userCollection = await usersCollection.insertOne(user)
                return res.send(userCollection)
            }
            if (alreadyAddeduser) {
                return res.send(alreadyAddeduser)
            }

        })
        app.get('/allUsers', async (req, res) => {
            const query = {}
            const allUsers = await usersCollection.find(query).toArray()
            res.send(allUsers)
        })
        app.get('/jwt', async (req, res) => {
            const email = req.query.email
            // console.log(email)
            const query = {
                email: email
            }
            const user = await usersCollection.findOne(query)
            // console.log(user)
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: "1hr" })
                return res.send({ accessToken: token })
            }
            // res.status(403).send({ accessToken: " " })
            res.send({ accessToken: " " })
        })
        app.get('/users/admin', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            res.send({ isAdmin: user?.role === "admin" })
        })
        app.put('/users/admin/:id', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email
            const query = {
                email: decodedEmail
            }
            const currentUser = await usersCollection.findOne(query)
            if (currentUser?.role !== "admin") {
                return res.status(403).send({ message: "Forbidden access" })
            }
            const id = req.params.id
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: "admin"
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })
        app.get('/appoinmentOptionsName', async (req, res) => {
            const query = {}
            const optionsName = await appoinmentOptionsCollection.find(query).project({ name: 1 }).toArray();
            res.send(optionsName)
        })
        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctorInfo = req.body
            // console.log(doctorInfo)
            const doctors = await doctorsCollection.insertOne(doctorInfo)
            res.send(doctors)
        })
        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {}
            const allDoctors = await doctorsCollection.find(query).toArray()
            res.send(allDoctors)
        })
        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            // console.log(id)
            const query = { _id: ObjectId(id) }
            const result = await doctorsCollection.deleteOne(query)
            res.send(result)
        })
        // to add extra field named price in appoinmentOptionsCollection
        /*  app.get('/addPrice', async (req, res) => {
             const filter = {}
             const updateDoc = {
                 $set: {
                     price: 99
                 }
             }
             const result = await appoinmentOptionsCollection.updateMany(filter, updateDoc)
             res.send(result)
         }) */
        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body
            const price = booking.price
            const amount = price * 100
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })
        app.post('/payments', async (req, res) => {
            const payment = req.body
            const result = await paymentsCollection.insertOne(payment)
            const id = payment.bookingId
            const filter = {
                _id: ObjectId(id)
            }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })


    }
    finally {

    }
}
run().catch(console.log)



app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})