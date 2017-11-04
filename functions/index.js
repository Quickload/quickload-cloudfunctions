const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.jobs = functions.https.onRequest((request, response) => {
    const docRef = admin.firestore().collection("jobs")

    var jobs = [];

    docRef
        .get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                jobs.push(doc.data());
            });

            response.send(200, jobs);
        });
});

