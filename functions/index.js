const functions = require('firebase-functions');
const admin = require('firebase-admin');
// const cors = require('cors')({
//     origin: true
// });
admin.initializeApp(functions.config().firebase);

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//

function useCors(req, res) {
    res.set('Access-Control-Allow-Origin', "*")
    res.set('Access-Control-Allow-Methods', 'GET, POST')

    return res
}


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

// exports.addJob = functions.https.onRequest((request, response) => {
//     cors((request, response, () => {
//         let userJobRef = null
//         if (request.query.pinned) {
//             jobRef = admin.firestore().collection("users").doc(request.query.userId).collection("pinnedJobs")
//         } else {
//             jobRef = admin.firestore().collection("users").doc(request.query.userId).collection("acceptedJobs")
//         }

//         jobRef
//             .get()
//             .then(snapshot => {
//                 snapshot.forEach(doc => {
//                     jobs.push(doc.data());
//                 });


//                 // const filteredJobs = jobs.map((job) => {
//                 //     return {
//                 //         id: job.documentID,
//                 //         PickCity: job.PickCity,
//                 //         QLNumber: job.QLNumber
//                 //     }
//                 // })

//                 response.send(200, jobs);
//             });
//     }));
// });