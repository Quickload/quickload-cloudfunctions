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

/**
 * A simple function to extract and manipulate the objects for tags
 * @param {Object} data 
 */
function checkLoadTypeAndPopulate(data) {
    if (data.ShipmentTypeName === 'Partial') {
        data.ShipType = {
            lebel: data.ShipmentTypeName,
            tags: [data.LoadType, data.PalletsQuantity, data.TotalWeight + ' ' + data.WeightUnitTypeId]
        }
    }
    if (data.ShipmentTypeName === 'Full') {
        data.ShipType = {
            label: data.ShipmentTypeName,
            tags: [data.TotalWeight + ' ' + data.WeightUnitTypeId]
        }
    }
    if (data.ShipmentTypeName === 'Container') {
        data.ShipType = {
            label: data.ShipmentTypeName,
            tags: [data.LoadType, data.PalletsQuantity, data.TotalWeight + ' ' + data.WeightUnitTypeId, data.ContainerSize + ' ' + data.ContainerSizeUnit, data.ContainerType]
        }
    }
    return data;
}

/**
 * Get Job by id
 * Params: jobId: String
 */
exports.job = functions.https.onRequest((request, response) => {
    response.set('Access-Control-Allow-Origin', "*")
    response.set('Access-Control-Allow-Methods', 'GET, POST')

    let job = {}
    const jobId = request.query.jobId
    const jobRef = admin.firestore().collection("jobs").doc(jobId)

    jobRef.get()
        .then(doc => {
            job = checkLoadTypeAndPopulate(doc.data());
            job["jobId"] = doc.id
            response.send(200, job);
        })
})

// Get all jobs
// Data dump for now
// Can map filters when needed
exports.jobs = functions.https.onRequest((request, response) => {
    const docRef = admin.firestore().collection("jobs")
    // response = useCors(response);
    response.set('Access-Control-Allow-Origin', "*")
    response.set('Access-Control-Allow-Methods', 'GET, POST')

    let jobs = [];

    docRef
        .get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                let data = checkLoadTypeAndPopulate(doc.data());
                data["jobId"] = doc.id;
                jobs.push(data);
            });

            // if we are sent a user id
            // filter the job list of the user's jobs so we don't get duplicates
            const uid = request.query.userId
            if (uid) {
                const userRef = admin.firestore().collection("users")
                    .doc(uid)
                    .collection("acceptedJobs")
                    .get()
                    .then(snapshot => {
                        let userJobs = []
                        snapshot.forEach(doc => {
                            userJobs.push(doc.data());
                        });

                        const jobsExcludingUser = jobs.filter(function (job) {
                            return userJobs.filter(function (userJob) {
                                return userJob.jobId == job.jobId;
                            }).length == 0
                        })

                        response.send(200, jobsExcludingUser);
                    })
            } else {
                console.log(jobs.length, "all jobs")
                response.send(200, jobs);
            }
        });
});

// Get a user
// Using references to accepted jobs,
// Append acceptedJobs object to user
// We need to use promises to resolve data fetching gracefully
exports.user = functions.https.onRequest((request, response) => {
    response.set('Access-Control-Allow-Origin', "*")
    response.set('Access-Control-Allow-Methods', 'GET, POST')

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
    response.set('Access-Control-Allow-Origin', "*")
    response.set('Access-Control-Allow-Methods', 'GET, POST')

    const uid = request.query.userId

    const data = {
        jobId: request.query.jobId
    }

    //Setting the User ID in the Job
    admin.firestore().collection('jobs').doc(data.jobId).set({ AcceptedBy: uid }, { merge: true });

    let userJobRef = admin.firestore().collection("users")
        .doc(uid)
        .collection("acceptedJobs").doc(request.query.jobId)
        .set(data)
        .then(_ => response.redirect(`https://us-central1-quickload-f4a75.cloudfunctions.net/user?userId=${uid}`))

    // response.send(200);
    // response.redirect(`https://us-central1-quickload-f4a75.cloudfunctions.net/user?userId=${uid}`);
});

// Remove job from user's acceptedJobs collection
exports.cancelJob = functions.https.onRequest((request, response) => {
    response.set('Access-Control-Allow-Origin', "*")
    response.set('Access-Control-Allow-Methods', 'GET, POST')

    const uid = request.query.userId

    let userJobRef = admin.firestore().collection("users")
        .doc(uid)
        .collection("acceptedJobs")
        .doc(request.query.jobId)
        .delete()
        .then(_ => response.redirect(`https://us-central1-quickload-f4a75.cloudfunctions.net/user?userId=${uid}`))

    // response.send(200);
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

// /**
//  * EMAILS
//  */

// // Template function for sending emails.
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
    res.set('Access-Control-Allow-Origin', "*")
    res.set('Access-Control-Allow-Methods', 'GET, POST')


    let locationList = [];
    let location = req.query.location;
    console.log(location)
    var query = db.collection('jobs').where("PickCity", "==", location);
    query.get().then(querySnapshot => {
        querySnapshot.forEach(documentSnapshot => {
            locationList.push(checkLoadTypeAndPopulate(documentSnapshot.data()));
            console.log(`Found document at ${documentSnapshot.ref.path}`);
        });
        res.status(200).send(locationList);
    });
});
