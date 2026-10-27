> ## Documentation Index
> Fetch the complete documentation index at: https://docs.fedapay.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Payouts management

A payout is an operation that allows you to transfer money directly from your balance to a customer’s account. This feature is designed for businesses that need to handle payments to specific clients.

### Steps to Create a Payout

Creating a payout through the API involves several steps. Each payout follows processes that must be respected to ensure smooth transfer.

**1. Payout Creation Request**

To begin, you need to send a request to create a payout via our API. The essential information required in the request includes:

* **amount** : The amount for the payout, always in whole numbers.

* **currency** : The currency to be used for the payout. You can indicate the ISO code of the chosen currency (e.g., XOF for CFA francs).

* **customer** : The customer receiving the payout. If the customer is not yet in your database, you can create them at the same time by providing details such as name, email, and phone number.

* **description (optional)**: A free-text field used to describe the purpose or intended use of the payout. This field can notably be used to:

  * specify the nature of the transaction (e.g. family support, service payment, purchase of goods, etc.);

  * comply with regulatory requirements, in particular those of the BCEAO regarding the justification of the use of transferred funds;

  * facilitate transaction tracking, identification, and data analysis within the dashboard and via the API.

The description field is optional at the API level in order to ensure backward compatibility with existing integrations. However, it may be required in certain dashboard interfaces to improve the traceability of payout operations.

#### Example of a request for creating a repository

```java Curl theme={null}
  curl -X POST \
  https://sandbox-api.fedapay.com/v1/payouts \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
        "amount" : 2000,
        "currency" : {"iso" : "XOF"},
        "mode": "mtn_open" , 
        "description": "service payment" , // Not required
        "customer" : {
            "firstname" : "John",
            "lastname" : "Doe",
            "email" : "john.doe@example.com",
            "phone_number" : {
                "number" : "+22997808080",
                "country" : "bj"
            }
        }
      }'
```

```javascript NodeJs theme={null}
const { FedaPay, Payout } = require('fedapay');
FedaPay.setApiKey('YOUR_API_KEY');
FedaPay.setEnvironment('sandbox');
const payout = await Payout.create(
{
  amount: 2000,
  currency: { iso: "XOF" },
  mode: "mtn_open", // Not required. FedaPay will detect the operator otherwise.
  description: "service payment", // Not required 
  customer: { // Not required.
    firstname: "John",
    lastname: "Doe",
    email: "john.doe@example.com",
    phone_number: {
      number: "+22997808080",
      country: "bj",
    },
  },
});
```

```php PHP theme={null}
\FedaPay\Fedapay::setApiKey(MY_API_KEY);
\FedaPay\Payout::create([
  "amount" => 2000,
  "currency" => ["iso" => "XOF"],
  "mode" => "mtn_open", // Not required. FedaPay will detect the operator otherwise.
  "description" => "service payment", // Not required
  "customer" => [ // Non obligatoire.
      "firstname" => "John",
      "lastname" => "Doe",
      "email" => "john.doe@example.com",
      "phone_number" => [
          "number" => "+22997808080",
          "country" => "bj",
      ],
  ],
]);
```

```Ruby Ruby theme={null}
require 'fedapay';
FedaPay.api_key = '';
FedaPay.environment = 'sandbox';
currency = { iso: 'XOF' };
payout = FedaPay::Payout.create({
  amount: 1000, 
  currency: currency,
  mode: "mtn_open", // Not required. FedaPay will detect the operator otherwise.
  description: "service payment", // Not required
  customer: { // Not required.
    firstname: "John",
    lastname: "Doe",
    email: "john.doe@example.com",
    phone_number: {
      number: "+22997808080",
      country: "bj",
    },
  },
});
```

> [!NOTE]
>
> [Find more information in our API Reference](https://docs.fedapay.com/api-reference/payouts/create.md)
>
> Sample code is available to simplify the creation of a repository via the API. Be sure to replace **YOUR\_SECRETE\_API\_KEY** with your sandbox or live private key.

> [!WARNING]
>
> **Note:**
>
> The **customer** parameter is not mandatory. However, when creating a transaction with a customer, make sure that the email address is unique. FedaPay considers it to be the same customer if the emails are identical. If you send the same email address but enter different first and last names and phone numbers, FedaPay will simply update the customer with the new information.

**2. Sending the Payout**

Once a payout has been created, it will be marked as **pending**. You then need to proceed with sending the payout. Two options are available:

* Send the payout immediately.

* Schedule the payout for later.

```java Curl theme={null}
    curl -X PUT \
https://sandbox-api.fedapay.com/v1/payouts/start \
-H 'Authorization: Bearer TOKEN' \
-H 'Content-Type: application/json'
-d '{
    "payouts" : [
      { "id": 23 }, // Sends the deposit instantly
      { "id": 23, "phone_number": { "number": "66000001", "country": "BJ" } }, // Sends deposit instantly with phone number
      { "id": 24 , "scheduled_at": "2024-11-18 18:8:43"} // Send payout later
    ]
  }'
```

```javascript NodeJs theme={null}
  const payout = await Payout.create({...});
  // Send payout now
  await payout.sendNow();
  // Sending a payout to a telephone number other than that of the customer
  await payout.sendNow({
    phone_number: {
      number: "64000001",
      country: "BJ"
    }
  });
  // Send payout later
  await payout.schedule("2024-11-18 18:8:43");
  // Sending a payout to a telephone number other than that of the customer
  await payout.schedule("2024-11-18 18:8:43", {
    phone_number: {
      number: "64000001",
      country: "BJ"
    }
  });
  // Schedule multiple shipments
  await Payout.scheduleAll([
      {
        id: 23, // Sends the payout instantly
        scheduled_at: "2024-11-18 18:8:43" // Send payout later
      },
      {
        id: 24, // Sends the payout instantly
        scheduled_at: "2024-11-18 18:8:43" // Send payout later
      },
      {
        id: 25,
        scheduled_at: "2024-11-18 18:8:43",
        phone_number: {
          number: "64000001",
          country: "BJ"
        }
      }
  ]);
  // Send all deposits instantly
  await Payout.sendAllNow([
      { id: 23 },
      { id: 24 },
      {
        id: 24,
        phone_number: {
          number: "64000001",
          country: "BJ"
        }
      }
  ]);
```

```php PHP theme={null}
  $payout = \FedaPay\Payout::create(array(...));
  // Send deposit now
  $payout->sendNow();
  // Sending a payout to a telephone number other than that of the customer
  $payout->sendNow([
    "phone_number" => [
      "number" => "64000001",
      "country" => "BJ"
    ]
  ]);
   // Schedule a payout for later
  $payout->schedule("2024-11-18 18:8:43");
  // Schedule a payout for later but on a different number
than the customer's
  $payout->schedule("2024-11-18 18:8:43", [
    "phone_number" => [
      "number" => "64000001",
      "country" => "BJ"
    ]
  ]);
  // Programming multiple shipments
  Payout::scheduleAll([
      [
        "id" => 23 // Sends the deposit instantly
      ],
      [
        "id" => 24,
        "scheduled_at" => "2024-11-18 18:8:43" // Send deposit later
      ],
      [
        "id" => 25,
        "scheduled_at" => "2024-11-18 18:8:43",
        "phone_number" => [
          "number" => "64000001",
          "country" => "BJ"
        ]
      ]
  ]);
  // Send all payments instantly
  Payout::sendAllNow([
      [ "id" => 23 ],
      [ "id" => 24 ],
      [
        "id" => 24,
        "phone_number" => [
          "number" => "64000001",
          "country" => "BJ"
        ]
      ]
  ]);
```

```ruby Ruby theme={null}
  payout = FedaPay::Payout.create({...});
  # Send payout now
  payout.sendNow();
  # Sending a payout to a telephone number other than that of the customer
  payout.sendNow({
    phone_number: {
      number: "64000001",
      country: "BJ"
    }
  });
  # Send payout later
  payout.schedule("2024-11-18 18:8:43");
  # Schedule a deposit for later but on a different number
than the customer's
  payout.schedule("2024-11-18 18:8:43", {
    phone_number: {
      number: "64000001",
      country: "BJ"
    }
  });
  # Schedule multiple shipments
  FedaPay::Payout.scheduleAll([
      {
        id: 23, # Sends the payout instantly
        scheduled_at: "2024-11-18 18:8:43" # Send payout later
      },
      {
        id: 24, # Sends the payout instantly
        scheduled_at: "2024-11-18 18:8:43" # Send payout later
      },
      {
        id: 25,
        scheduled_at: "2024-11-18 18:8:43",
        phone_number: {
          number: "64000001",
          country: "BJ"
        }
      }
  ]);
  # Send all deposits instantly
  FedaPay::Payout.sendAllNow([
      { id: 23 },
      { id: 24 },
      {
        id: 24,
        phone_number: {
          number: "64000001",
          country: "BJ"
        }
      }
  ]);
```

**3. Retrieve Payout Details**

After creating and/or sending the payout, you can view its details to obtain specific information, such as status or payout history.

#### Example query to retrieve payout details

```java Curl theme={null}

/*Replace YOUR_API_SECRET_KEY by the API secret key of your sandbox or live account. If you are using your live account, you must replace the link by https://api.fedapay.com/v1/payouts/ID   */

  curl -X GET \
  https://sandbox-api.fedapay.com/v1/payouts/ID \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json'
```

```javascript NodeJs theme={null}
const { FedaPay, Payout } = require('fedapay');
/* Replace YOUR_SECRETE_API_KEY with your real API key */
FedaPay.setApiKey("YOUR_SECRETE_API_KEY");
/* Specify whether you want to run your query in test or live mode */
FedaPay.setEnvironment('sandbox'); //or setEnvironment('live');
/* Show a payout */
const payout = await Payout.retrieve(params = {}, headers = {});
```

```php PHP theme={null}
\FedaPay\Fedapay::setApiKey(MY_API_KEY);
$customer = \FedaPay\Payout::retrieve(ID, params = {}, header = {});
```

```Ruby Ruby theme={null}
require 'fedapay';
# configure FedaPay library
FedaPay.api_key = '' # Your secret api key
FedaPay.environment = '' # sandbox or live
payouts = FedaPay::Payout.retrieve(ID);
```

> [!NOTE]
>
> [Find more information in our API Reference](https://docs.fedapay.com/api-reference/payouts/get-by-id.md)
>
> Retrieve information on a specific repository using its unique identifier (ID). Replace **ID** in the URL with the ID of the repository you wish to consult.

### Payout Lifecycle

When a payout is created, it moves through several statuses:

* **pending** : Pending (initial status after payout creation).

* **started** : The payout has been validated and is in the process of being initiated.

* **processing** : The payout is being processed and sent to the recipient.

* **sent** : The payout has been successfully sent to the recipient.

* **failed** : The payout failed due to issues such as technical error or method-related problems.

You can track the status of your payouts from the FedaPay dashboard under the **Payouts** section.

### Available Payout Methods

Currently, [the available payout methods](https://docs.fedapay.com/en/payment-methods.md) for sending funds to different countries in West Africa are supported

These methods make it easy to send money to various countries in the region.

### Add Custom Metadata to Your Payouts

When initiating a **payout** from your FedaPay balance to a Mobile Money account (MTN Benin, MTN Côte d’Ivoire, Moov Benin, Moov Togo, or Togocel), you can attach custom metadata to the operation using the **custom\_metadata** field.

This allows you to enrich each payout with useful business-related information, such as a user ID, a transfer purpose, a service reference, or any data specific to your system.

**Why Use custom\_metadata in a Payout?**

The custom\_metadata field is particularly helpful for:

* Keeping a clear and structured trace of each transaction within your platform.

* Automating internal processes by linking payouts to users, orders, or events.

* Simplifying audits and reconciliation with metadata stored directly in the transaction.

* Saving time by avoiding manual cross-referencing between FedaPay IDs and your own records.

**Example: Perform a Payout with Custom Metadata**

Here's a sample API request to send a payout with attached metadata:

```java Curl theme={null}
  curl -X POST \
-H 'Authorization: Bearer TOKEN' \
-H 'Content-Type: application/json' \
-d '{
"amount": 3000,
"currency": {"iso": "XOF"},
"description": "Paiement de la commission d’un agent terrain",
"receiver": {
"name": "Koffi Kodjo",
"phone_number": "+22961234567",
"provider": "mtn"
},
"custom_metadata": {
"agent_id": "AGT-0032",
"mois": "Juillet",
"type": "commission"
}
}'
```

```javascript NodeJs theme={null}
const { FedaPay, Payout } = require('fedapay');
/* Replace YOUR_SECRET_API_KEY with your real API key */
FedaPay.setApiKey("YOUR_SECRET_API_KEY");
/* Specify whether you want to run your query in test or live mode */
FedaPay.setEnvironment('sandbox'); // or 'live'
/* Create a payout with custom metadata */
const payout = await Payout.create({
amount: 3000,
currency: { iso: "XOF" },
description: "Paiement de la commission d’un agent terrain",
receiver: {
name: "Koffi Kodjo",
phone_number: "+22961234567",
provider: "mtn"
},
custom_metadata: {
agent_id: "AGT-0032",
mois: "Juillet",
type: "commission"
}
});
console.log("Payout created:", payout.id);

```

```php PHP theme={null}
// Configurer la clé API et l'environnement
\FedaPay\FedaPay::setApiKey('YOUR_SECRET_API_KEY');
\FedaPay\FedaPay::setEnvironment('sandbox'); // ou 'live'
// Créer un dépôt avec des métadonnées personnalisées
$payout = \FedaPay\Payout::create([
"amount" => 3000,
"currency" => ["iso" => "XOF"],
"description" => "Paiement de la commission d’un agent terrain",
"receiver" => [
"name" => "Koffi Kodjo",
"phone_number" => "+22961234567",
"provider" => "mtn"
],
"custom_metadata" => [
"agent_id" => "AGT-0032",
"mois" => "Juillet",
"type" => "commission"
]
]);
echo "Payout created: " . $payout->id;
```

```Ruby Ruby theme={null}
require 'fedapay'
FedaPay.api_key = 'YOUR_SECRET_API_KEY'
FedaPay.environment = 'sandbox' # or 'live'
payout = FedaPay::Payout.create(
amount: 3000,
currency: { iso: 'XOF' },
description: 'Paiement de la commission d’un agent terrain',
receiver: {
name: 'Koffi Kodjo',
phone_number: '+22961234567',
provider: 'mtn'
},
custom_metadata: {
agent_id: 'AGT-0032',
mois: 'Juillet',
type: 'commission'
}
)

puts "Payout created: #{payout.id}"
```

**Good to Know**

* The custom\_metadata field accepts a JSON object with key-value pairs.

* Use simple and meaningful keys like type, month, client\_id.

* This field is optional, but strongly recommended for better data management and traceability.

* Avoid including sensitive or confidential information, such as passwords or card details.

### merchant\_reference: Your unique identifier for each payout

The merchant\_reference field allows you to assign each payout operation (transfer of money from your FedaPay merchant account to a Mobile Money number ) a unique identifier defined by you.This identifier is stored by FedaPay and can later be used to easily retrieve or track a payout through a dedicated API.

**Why use it?**

* **Precise tracking of outgoing transfers**: Ideal if you manage multiple payments to suppliers, partners, couriers, or users.

* **Internal traceability**: Lets you link a FedaPay payout to an internal payment (for example, a refund, commission, or salary payment).

* **Simplified search**: Retrieve a payout at any time using its merchant\_reference, without needing to store the FedaPay-generated ID.

* **Audit & reporting**: Very useful for generating reports or ensuring the accounting and financial compliance of your outgoing flows.

**Example: Create a payout with merchant\_reference**

```java Curl theme={null}
curl -X POST https://sandbox-api.fedapay.com/v1/payouts \
-H 'Authorization: Bearer YOUR_SECRET_API_KEY' \
-H 'Content-Type: application/json' \
-d '{
"amount": 5000,
"currency": {"iso": "XOF"},
"description": "Paiement fournisseur Mars 2025",
"recipient": {
  "name": "Kossi Agbo",
  "phone_number": {
    "number": "97000001",
    "country": "bj"
  }
},
"merchant_reference": "PAY-20250315-002"
}'

```

```javascript NodeJs theme={null}
const { FedaPay, Payout } = require('fedapay');
/* Replace YOUR_SECRET_API_KEY with your real API key */
FedaPay.setApiKey("YOUR_SECRET_API_KEY");
/* Set environment */
FedaPay.setEnvironment('sandbox'); // or 'live'
/* Create a payout with merchant_reference */
const payout = await Payout.create({
amount: 5000,
currency: { iso: 'XOF' },
description: 'Paiement fournisseur Mars 2025',
recipient: {
name: 'Kossi Agbo',
phone_number: { number: '97000001', country: 'bj' }
},
merchant_reference: 'PAY-20250315-002'
});

console.log("Payout created:", payout.id);
```

```php PHP theme={null}
\FedaPay\FedaPay::setApiKey('YOUR_SECRET_API_KEY');
\FedaPay\FedaPay::setEnvironment('sandbox'); // ou 'live'
$payout = \FedaPay\Payout::create([
"amount" => 5000,
"currency" => ["iso" => "XOF"],
"description" => "Paiement fournisseur Mars 2025",
"recipient" => [
"name" => "Kossi Agbo",
"phone_number" => [
"number" => "97000001",
"country" => "bj"
]
],
"merchant_reference" => "PAY-20250315-002"
]);

echo "Payout created: " . $payout->id;
```

```Ruby Ruby theme={null}
require 'fedapay'
FedaPay.api_key = 'YOUR_SECRET_API_KEY'
FedaPay.environment = 'sandbox' # or 'live'
payout = FedaPay::Payout.create(
amount: 5000,
currency: { iso: 'XOF' },
description: 'Paiement fournisseur Mars 2025',
recipient: {
name: 'Kossi Agbo',
phone_number: { number: '97000001', country: 'bj' }
},
merchant_reference: 'PAY-20250315-002'
)

puts "Payout created: #{payout.id}"
```

**Retrieve a payout using the merchant reference**

```java Curl theme={null}
curl -X GET \
https://sandbox-api.fedapay.com/v1/payouts/merchant/PAY-20250315-002 \
-H 'Authorization: Bearer YOUR_SECRET_API_KEY' \
-H 'Content-Type: application/json'
```

```javascript NodeJs theme={null}
const { FedaPay, Payout } = require('fedapay');
FedaPay.setApiKey("YOUR_SECRET_API_KEY");
FedaPay.setEnvironment('sandbox');
const reference = 'PAY-20250315-002';
const payout = await Payout.retrieveByMerchantReference(reference);

console.log("Payout found:", payout.id);
```

```php PHP theme={null}
$merchant_reference = 'PAY-20250315-002';
$payout = \FedaPay\Payout::retrieveByMerchantReference($merchant_reference);
echo "Payout found: " . $payout->id;
```

```Ruby Ruby theme={null}
require 'fedapay'
FedaPay.api_key = 'YOUR_SECRET_API_KEY'
FedaPay.environment = 'sandbox' # or 'live'
reference = 'PAY-20250315-002'
payout = FedaPay::Payout.retrieve_by_merchant_reference(reference)
puts "Payout found: #{payout.id}"

```

> [!WARNING]
>
> \*\*Best practices : \*\*
>
> * Use a structured format for your references, e.g., PAY-YYYYMMDD-XXX.
>
> * Never reuse the same merchant\_reference for multiple payouts.
>
> * You can also combine merchant\_reference and custom\_metadata to add details (such as employee ID, campaign, or project identifiers).

### Support

If you have any questions or encounter difficulties with payouts, feel free to contact our support team at: [`support@fedapay.com`](mailto:support@fedapay.com)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.