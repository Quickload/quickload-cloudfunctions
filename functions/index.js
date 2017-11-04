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


exports.user = functions.https.onRequest((request, response) => {
    const uid = request.query.userId
    const usersRef = admin.firestore().collection("users")
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
                console.log('Document data:', doc.data());
                user = doc.data()
                const pinnedJobsPromise = pinnedJobsRef
                    .get()
                    .then(snapshot => {
                        snapshot.forEach(doc => {
                            console.log('Pinned data:', doc.data());
                            pinnedJobs.push(doc.data());
                        });
                        return pinnedJobs
                    })

                const acceptedJobPromise = acceptJobsRef
                    .get()
                    .then(snapshot => {
                        snapshot.forEach(doc => {
                            console.log('Accepted data:', doc.data());
                            acceptJobs.push(doc.data());
                        });
                        return acceptJobs
                    })

                Promise.all([acceptedJobPromise, pinnedJobsPromise])
                    .then(val => {
                        user.acceptedJobs = val[0]
                        user.pinnedJobs = val[1]

                        console.log(user);

                        response.send(200, user)
                        // response.send(200).body(user);
                    })


                // response.send(200, user)
            }
        });
});