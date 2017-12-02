const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
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
            tags: [
                data.LoadType,
                data.PalletsQuantity + ' ' + data.LoadType + (data.PalletsQuantity > 1 ? 's' : '' + ' '),
                data.TotalWeight + ' ' + data.WeightUnitTypeId
            ]
        }
    }
    if (data.ShipmentTypeName === 'Full') {
        data.ShipType = {
            label: data.ShipmentTypeName,
            tags: [
                data.LoadType,
                data.PalletsQuantity + ' ' + data.LoadType + (data.PalletsQuantity > 1 ? 's' : '' + ' '),
                data.TotalWeight + ' ' + data.WeightUnitTypeId
            ]
        }
    }
    if (data.ShipmentTypeName === 'Container') {
        data.ShipType = {
            label: data.ShipmentTypeName,
            tags: [
                data.LoadType,
                data.PalletsQuantity + ' ' + data.LoadType + (data.PalletsQuantity > 1 ? 's' : '' + ' '),
                data.TotalWeight + ' ' + data.WeightUnitTypeId,
                data.ContainerSize + ' ' + data.ContainerSizeUnit,
                data.ContainerType
            ]
        }
    }
    const rex = /\S/
    data.ShipType.tags = data.ShipType.tags.filter(rex.test.bind(rex));
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

exports.getJobsByUser = functions.https.onRequest((req, res) => {
    res.set('Access-Control-Allow-Origin', "*")
    res.set('Access-Control-Allow-Methods', 'GET, POST')

    const userEmail = req.query.email;
    console.log(userEmail)
    db.collection('users').where('emailId', '==', userEmail).get().then(querySnapshot => {
        querySnapshot.forEach(documentSnapshot => {
            console.log(documentSnapshot.data());
            res.redirect(`https://us-central1-quickload-f4a75.cloudfunctions.net/user?userId=${documentSnapshot.data().userId}`);
        });
    });
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
        // const displayName = "userName here"; // The display name of the user.
        // [END eventAttributes]

        return sendEmail(email, displayName);
    });

// /**
//  * EMAILS
//  */

// // Template function for sending emails.
function sendEmail(email, template) {
    const mailOptions = {
        from: `${APP_NAME} <noreply@firebase.com>`,
        to: email
    };

    // The user subscribed to the newsletter.
    mailOptions.subject = `${APP_NAME} - Accepted Load!`;
    mailOptions.html = template;
    return mailTransport.sendMail(mailOptions).then(() => {
        console.log('New welcome email sent to:', email);
    });
}

exports.feedbackEmail = functions.https.onRequest((request, response) => {
    cors(request, response, () => {
        console.log(request, 'request');

        const user = request.body.user;
        const job = request.body.job;
        const email = request.body.email;

        const template = `
    <body bgcolor="#f6f6f6" style="background-color: #f6f6f6; font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: none; width: 100% !important; height: 100%; margin: 0; padding: 0;">&#13;
    &#13;
    &#13;
        <table style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; width: 100%; margin: 0;;"><tr style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;"><td style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;"><div style="text-align: center; font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; max-width: 600px; display: block; margin: 0 auto; margin-top: 50px; padding: 0;"><img style="text-align: center; width: 200px; height: auto;" src="https://www.quickload.com/images/quickload.png" alt="logo" /></div></td>&#13;</tr></table>
    
    <table style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; width: 100%; margin: 0; padding: 20px;"><tr style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;"><td style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;"></td>&#13;
            <td bgcolor="#FFFFFF" style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; display: block !important; max-width: 600px !important; clear: both !important; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0;">&#13;
    &#13;
                &#13;
                <div style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; max-width: 600px; display: block; margin: 0 auto; padding: 0;">&#13;
                <table style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; width: 100%; margin: 0; padding: 0;"><tr style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;"><td style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;">&#13;
                            <p style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: normal; margin: 0 0 10px; padding: 0;">Hi BOS Cargo, Great news! You got a new job from Miami to Pompano Beach. Details below:</p>&#13;
                            <p style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: bold; margin: 0 0 10px; padding: 0;">Driver: ${user.name}</p>&#13;
                            <p style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: bold; margin: 0 0 10px; padding: 0;">Load Details: </p>&#13;
        
            <ul style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: normal; padding: 0;">
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">QuickLoad Shipment #: </span> ${job.QLNumber}
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Price: </span> ${job.JobPrice}
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">PO Number: </span> ${job.UserPoNumber}
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Material: </span> ${job.MaterialType}
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Accessorials: </span>
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Total Units / Total Weight: </span> ${job.PalletsQuantity} / ${job.TotalWeight}
              </li>
              
            </ul>&#13;
            
            <p style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: bold; margin: 0 0 10px; padding: 0;">Pickup Details: </p>&#13;
        
            <ul style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: normal; padding: 0;">
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Date: </span> ${job.PickDate}
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Time: Between </span> ${job.PickTime} to ${job.DropTime}
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Address: </span> <a href="https://maps.google.com/?q=${job.PickStreet}, ${job.PickCity}, ${job.PickState} ${job.PickZip}" style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; color: #348eda; margin: 0; padding: 0;">${job.PickStreet}, ${job.PickCity}, ${job.PickState} ${job.PickZip}</a>
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Contatct: </span> ${job.PickContactName}, <a href="tel:${job.PickContactPhone}" style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; color: #348eda; margin: 0; padding: 0;">${job.PickContactPhone}</a>
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Instructions: </span>
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Units / Total Weight: </span> ${job.PalletsQuantity} / ${job.TotalWeight}
              </li>
              
            </ul>&#13;
            
            <p style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: bold; margin: 0 0 10px; padding: 0;">Dropoff Details: </p>&#13;
        
            <ul style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: normal; padding: 0;">
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Date: </span> ${job.DropDate}
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Time: Between </span> ${job.PickTime} to ${job.DropTime}
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Address: </span> <a href="https://maps.google.com/?q=5491 ${job.DropStreet}, ${job.DropCity}, ${job.DropState} ${job.DropZip}" style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; color: #348eda; margin: 0; padding: 0;">5491 ${job.DropStreet}, ${job.DropCity}, ${job.DropState} ${job.DropZip}</a>
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Contatct: </span> ${job.DropContactName}, <a href="tel:${job.DropContactPhone}" style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; color: #348eda; margin: 0; padding: 0;">${job.DropContactPhone}</a>
              </li>
              <li style="margin-left: 10%;">
                <span style="font-weight: bold">Instructions: </span> 
              </li>
              
            </ul>&#13;
            
            <p style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: bold; margin: 0 0 10px; padding: 0;">Pro Tips: </p>&#13;
        
            <ul style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: normal; padding: 0;">
              <li style="margin-left: 10%;">
                Record and communicate time of arrival at the pick up and drop off locations
              </li>
              <li style="margin-left: 10%;">
                Contact us right away if waiting time exceeds 2 hours
              </li>
              <li style="margin-left: 10%;">
                When delivery is done, send the Proof of Delivery (POD) or Bill of Lading in order to get paid in 48 hours
              </li>
              
            </ul>&#13;
    
                            <p style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: normal; margin: 0 0 10px; padding: 0;">Thanks!</p>&#13;
            <p style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: normal; margin: 0 0 10px; padding: 0;">The Quickload Team</p>&#13;
                            <p style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; font-weight: normal; margin: 0 0 10px; padding: 0;">You can reach us at <a href="tel:305-827-0001" style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; color: #348eda; margin: 0; padding: 0;">(305) 827-0001</a> or e-mail at <a href="mailto:support@quickload.com" style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; color: #348eda; margin: 0; padding: 0;">support@quickload.com</a></p>&#13;
                        </td>&#13;
                    </tr></table></div>&#13;
                &#13;
                                        &#13;
            </td>&#13;
            <td style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;"></td>&#13;
        </tr></table><table style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; width: 100%; clear: both !important; margin: 0; padding: 0;"><tr style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;"><td style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;"></td>&#13;
            <td style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; display: block !important; max-width: 600px !important; clear: both !important; margin: 0 auto; padding: 0;">&#13;
                &#13;
                &#13;
                <div style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; max-width: 600px; display: block; margin: 0 auto; padding: 0;">&#13;
                    <table style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; width: 100%; margin: 0; padding: 0;"><tr style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;"><td align="center" style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;">&#13;
                                <p style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 18px; line-height: 1.6; color: #666; font-weight: bold; margin: 0 0 10px; padding: 0;">A clever, fast way to ship, with nothing to hide. <a href="#d41d8cd98f00b204e9800998ecf8427e" style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; color: #999; margin: 0; padding: 0;">&#13;
                                </p>&#13;
                            </td>&#13;
                        </tr>
                        <tr style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;"><td align="center" style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;">&#13;
                                <img src="https://image.freepik.com/free-icon/facebook-logo-in-circular-shape_318-60407.jpg" style="height: 50px; width: 50px; font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 18px; line-height: 1.6; color: #666; font-weight: bold; margin: 0 0 10px; padding: 0;"/>
                <img src="https://n6-img-fp.akamaized.net/free-icon/twitter-logo-button_318-85053.jpg?size=338c&ext=jpg" style="height: 50px; width: 50px; font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 18px; line-height: 1.6; color: #666; font-weight: bold; margin: 0 0 10px; padding: 0;"/>
                <img src="https://n6-img-fp.akamaized.net/free-icon/linkedin-logo-button_318-84979.jpg?size=338c&ext=jpg" style="height: 50px; width: 50px; font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 18px; line-height: 1.6; color: #666; font-weight: bold; margin: 0 0 10px; padding: 0;"/>
                <img src="http://www.bsr.ac.uk/site2014/wp-content/uploads/2013/11/instagramicon.png" style="height: 50px; width: 50px; font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 18px; line-height: 1.6; color: #666; font-weight: bold; margin: 0 0 10px; padding: 0;"/>
                            </td>&#13;
                        </tr>  
              
                        </table></div>&#13;
                &#13;
                    &#13;
            </td>&#13;
            <td style="font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; font-size: 100%; line-height: 1.6; margin: 0; padding: 0;"></td>&#13;
        </tr></table></body>
    `;

        sendEmail(email, template);

        response.send(200, 'email sent');
    })
});



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
