const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
// Configure the email transport using the default SMTP transport and a GMail account.
// For Gmail, enable these:
// 1. https://www.google.com/settings/security/lesssecureapps
// 2. https://accounts.google.com/DisplayUnlockCaptcha
// For other types of transports such as Sendgrid see https://nodemailer.com/transports/
// TODO: Configure the `gmail.email` and `gmail.password` Google Cloud environment variables.
const gmailEmail = encodeURIComponent(functions.config().gmail.email);
const gmailPassword = encodeURIComponent(functions.config().gmail.password);
const mailTransport = nodemailer.createTransport(
    `smtps://${gmailEmail}:${gmailPassword}@smtp.gmail.com`);

// const cors = require('cors')({
//     origin: true
// });
admin.initializeApp(functions.config().firebase);
var db = admin.firestore();




// Your company name to include in the emails
// TODO: Change this to your app or company name to customize the email sent.
const APP_NAME = 'Quickload';

function useCors(req, res) {
    res.set('Access-Control-Allow-Origin', "*")
    res.set('Access-Control-Allow-Methods', 'GET, POST')

    return res
}


// Get all jobs
// Data dump for now
// Can map filters when needed
exports.jobs = functions.https.onRequest((request, response) => {
    const docRef = admin.firestore().collection("jobs")
    // response = useCors(response);
    response.set('Access-Control-Allow-Origin', "*")
    response.set('Access-Control-Allow-Methods', 'GET, POST')
    var jobs = [];

    docRef
        .get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                jobs.push(doc.data());
            });


            // const filteredJobs = jobs.map((job) => {
            //     return {
            //         id: job.documentID,
            //         PickCity: job.PickCity,
            //         QLNumber: job.QLNumber
            //     }
            // })

            response.send(200, jobs);
        });
});

// Get a user
// Using references to accepted jobs,
// Append acceptedJobs object to user
// We need to use promises to resolve data fetching gracefully
exports.user = functions.https.onRequest((request, response) => {
    const uid = request.query.userId
    const usersRef = admin.firestore().collection("users")
    const jobsRef = admin.firestore().collection("jobs")
    const selectedUserRef = usersRef.doc(uid)
    const pinnedJobsRef = selectedUserRef.collection("pinnedJobs")
    const acceptJobsRef = selectedUserRef.collection("acceptedJobs")

    let user = {}
    let pinnedJobs = []
    let acceptJobs = []
    selectedUserRef.get()
        .then(doc => {
            if (!doc.exists) {
                console.log('No such document!');
            } else {
                // console.log('Document data:', doc.data());
                user = doc.data()
                const pinnedJobsPromise = pinnedJobsRef
                    .get()
                    .then(snapshot => {
                        let jobPromises = []
                        snapshot.forEach(doc => {
                            const jobId = doc.data().jobId
                            const jobPromise = jobsRef.doc(jobId)
                                .get()
                                .then(doc => {
                                    if (!doc.exists) {
                                        console.log('No such document!');
                                    } else {
                                        console.log(doc.data(), 'pinned data')
                                        pinnedJobs.push(doc.data())
                                    }
                                })
                            jobPromises.push(jobPromise)
                        });
                        return Promise.all(jobPromises).then(_ => pinnedJobs)
                    })

                const acceptedJobPromise = acceptJobsRef
                    .get()
                    .then(snapshot => {
                        let jobPromises = []
                        snapshot.forEach(doc => {
                            const jobId = doc.data().jobId
                            const jobPromise = jobsRef.doc(jobId)
                                .get()
                                .then(doc => {
                                    if (!doc.exists) {
                                        console.log('No such document!');
                                    } else {
                                        console.log(doc.data(), 'accepted data')
                                        acceptJobs.push(doc.data())
                                    }
                                })
                            jobPromises.push(jobPromise)
                        });
                        return Promise.all(jobPromises).then(_ => acceptJobs)
                    })

                Promise.all([acceptedJobPromise, pinnedJobsPromise])
                    .then(val => {
                        user.acceptedJobs = val[0]
                        user.pinnedJobs = val[1]

                        response.send(200, user)
                    })
            }
        });
});


// Add job to users acceptedJobs collection
// Send an email upon success
exports.addJob = functions.https.onRequest((request, response) => {
    const data = {
        jobId: request.query.jobId
    }

    let userJobRef = admin.firestore().collection("users")
        .doc(request.query.userId)
        .collection("acceptedJobs").doc(request.query.jobId)
        .set(data)

    response.send(200);
});

// Remove job from user's acceptedJobs collection
exports.cancelJob = functions.https.onRequest((request, response) => {
    let userJobRef = admin.firestore().collection("users")
        .doc(request.query.userId)
        .collection("acceptedJobs")
        .doc(request.query.jobId)
        .delete()

    response.send(200);
});

// [START onCreateTrigger]
exports.sendAcceptedJobEmail = functions.firestore.document('users/{uid}/acceptedJobs/{jobId}')
    .onCreate(event => {
        // [END onCreateTrigger]
        // [START eventAttributes]
        const user = event.data.data()

        const email = "gperlman27@gmail.com"; // The email of the user.
        const displayName = "userName here"; // The display name of the user.
        // [END eventAttributes]

        return sendEmail(email, displayName);
    });

/**
 * EMAILS
 */

// Template function for sending emails.
function sendEmail(email, displayName) {
    const mailOptions = {
        from: `${APP_NAME} <noreply@firebase.com>`,
        to: email
    };

    // The user subscribed to the newsletter.
    mailOptions.subject = `${APP_NAME} - Accepted Load!`;
    mailOptions.text = `Hey ${displayName || ''}! You just accepted a load. If you did not make this request, please cancel your job through the ${APP_NAME} app. I hope you will enjoy our service.`;
    return mailTransport.sendMail(mailOptions).then(() => {
        console.log('New welcome email sent to:', email);
    });
}


/**
 * Location Search Functionality. This will only work with the URL Encoded data
 */
exports.location = functions.https.onRequest((req, res) => {
    let locationList = [];
    let location = req.query.location;
    console.log(location)
    var query = db.collection('jobs').where("PickCity", "==", location);
    query.get().then(querySnapshot => {
        querySnapshot.forEach(documentSnapshot => {
            locationList.push(documentSnapshot.data());
            console.log(`Found document at ${documentSnapshot.ref.path}`);
        });
        locationList = locationList.map((obj) => {
            return {
                PickCity: obj.PickCity,
                PickStation: obj.PickStation,
                PickDate: obj.PickDate,
                QLNumber: obj.QLNumber,
                PickTime: obj.PickTime,
                DropDate: obj.DropDate,
                DropTime: obj.DropTime,
                JobPrice: obj.JobPrice,
                LoadType: obj.LoadType,
                Pallet: obj.Pallet,
                DropCity: obj.DropCity
            }
        })
        res.status(200).send(locationList);
    });
});
