if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({path: __dirname + '/.env'})
}



const
    express = require('express')
    , router = express.Router()

    , multer = require('multer')
    , inMemoryStorage = multer.memoryStorage()
    , uploadStrategy = multer({ storage: inMemoryStorage }).single('image')
    , request = require('request')
    , azureStorage = require('azure-storage')
    , blobService = azureStorage.createBlobService()
    , getStream = require('into-stream')
    , containerName = 'image'
    , sql = require('mssql')
    , subscriptionKey = '18351897110a420692d2a3d8783b81de'
    , uriBase = 'https://southeastasia.api.cognitive.microsoft.com/vision/v2.0/analyze';

const params = {
  'visualFeatures': 'Categories,Description,Color',
  'details': '',
  'language': 'en'
};

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/:id/success', async function (req, res, next) {

  const id = req.params.id

  const requestSql = new sql.Request();

  await requestSql.query(
      "select * from dbo.image where id = " + id , function (error, data) {
        if(error) return console.log(error);

        const url = data.recordset[0].url;

        const options = {
          uri: uriBase,
          qs: params,
          body: '{"url": ' + '"' + url + '"}',
          headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key' : subscriptionKey
          }
        };

        request.post(options, (error, response, body) => {
          if (error) {
            console.log('Error: ', error);
            return;
          }

          const jsonResponse =  JSON.parse(body)
          const captions = jsonResponse['description']['captions'][0].text


          res.render('success', {
            title : 'Computer Vison',
            url : url,
            captions : captions
          });

        });



      }
  )


})

router.post('/', uploadStrategy, function(req, res, next) {
  const
      blobName = getBlobName(req.file.originalname)
      , stream = getStream(req.file.buffer)
      , streamLength = req.file.buffer.length
  ;

  console.log("Stream"+ stream)
  console.log("Stream lenght" + streamLength)

  const startDate = new Date();
  const expiryDate = new Date(startDate);
  expiryDate.setMinutes(startDate.getMinutes() + 100);
  startDate.setMinutes(startDate.getMinutes() - 100);

  var sharedAccessPolicy = {
    AccessPolicy: {
      Permissions: azureStorage.BlobUtilities.SharedAccessPermissions.READ,
      Start: startDate,
      Expiry: expiryDate
    },
  };



  blobService.createBlockBlobFromStream(containerName, blobName, stream, streamLength, err => {
    if(err) {
      return console.log("ERROR " + err)
    }

    const token = blobService.generateSharedAccessSignature(containerName, blobName, sharedAccessPolicy);

    const sasUrl = blobService.getUrl(containerName, blobName, token);

    console.log("URL" + sasUrl)

    const transaction = new sql.Transaction()

    transaction.begin(err => {
      const request = new sql.Request(transaction)
      request.query("insert into dbo.image(url, description) values('" + sasUrl +
          "', 'Test Image');", (err, result) => {
        if(err) console.log('Error insert' + err)

        transaction.commit(err => {
          if(err) console.log('Error commit' + err);

          const request = new sql.Request();

          request.query(
              "select * from dbo.image where url = '" + sasUrl + "'" , function (error, data) {
                if(error) console.log(error);

                const id = data.recordset[0].id
                res.redirect('/' + id.toString() + '/success')

              }
          )



          console.log('Transaction commited');
        })
      });
    } )



  });


});

const getBlobName = originalName => {
  const identifier = Math.random().toString().replace(/0\./, ''); // remove "0." from start of string
  return `${identifier}-${originalName}`;
};





module.exports = router;
