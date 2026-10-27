> ## Documentation Index
> Fetch the complete documentation index at: https://docs.fedapay.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Authentication

The FedaPay API enables you to easily integrate payment solutions into your website or application. It offers powerful tools to manage transactions, track payments, and interact with customers securely and seamlessly, whether you’re a developer or a business owner.

To help you make the most of FedaPay’s services, the integration process on your platform is divided into three main steps:

1. **Obtain your API keys** to authenticate your requests.

2. **Install an API** library to interact with FedaPay.

3. **Perform an API test request** to validate the integration.

## Overview of the FedaPay API

With FedaPay’s solution, you can:

* **Create Transactions**: Manage payments and track their status.

* **Manage Customers**: Save customer information for recurring payments or easy tracking.

* **Configure Notifications**: Receive real-time alerts about changes in transaction status.

The FedaPay API supports two distinct operating modes:

* **Test Mode**: Allows you to simulate transactions and test your integration without making real payments.

* **Live Mode**: Once your integration is validated, switch to production to handle real transactions.

Objects created in Test Mode (e.g., customers, transactions) are entirely separate from those created in Live Mode, preventing data mixing between the two environments.

#### Steps to Integrate FedaPay into Your Application

**1. Obtain Your API Keys**

Each FedaPay account has two API keys:

* **Test Key**: Used for making requests in test mode.

* **Live Key**: Used for managing real transactions.

These keys are essential for FedaPay to authenticate your requests. Without a valid key, your requests will fail.

You can retrieve your API keys from your FedaPay account dashboard.

**2. Install a FedaPay Library**

**3. Perform an API Test Request**

Once you have your keys and the library installed, it’s time to run a test to validate your integration.

> [!NOTE]
>
> Here’s an example request to create a test transaction using the [API Reference](https://docs.fedapay.com/api-reference/transactions/create.md).

FedaPay will respond with a transaction object containing the details of the operation.

## Quick Integration Guide

1. **Create an account** on FedaPay (Test or Live).

2. **Retrieve your API keys** from your dashboard.

3. **Install the library** that matches your development environment (PHP, Node.js, etc.).

4. **Make an initial request** to create a test transaction and verify functionality.

## FedaPay API Authentication

Authenticating requests with the FedaPay API is a crucial step to ensure the security and integrity of your requests when interacting with the platform. Every request sent to FedaPay must be authenticated with your API keys, allowing FedaPay to verify that the requests are from an authorized source.

#### API Keys: Types and Functionality

Each FedaPay account has two sets of API keys for different environments:

1. **Test Keys**: Used in development environments to simulate transactions without financial impact. They allow you to verify that your integration works properly.

2. **Live Keys**: Used in production environments to handle real transactions.

It’s important not to mix these keys; objects (like transactions and customers) created in Test Mode cannot be accessed or manipulated in Live Mode, and vice versa.

Additionally, there are two types of API keys in each mode:

* **Public Key**: Used to identify your FedaPay account in front-end environments (such as mobile applications or JavaScript interfaces). It doesn’t grant access to critical actions but enables token creation.

* **Secret Key**: Must remain confidential. This key provides access to all API functions and allows sensitive actions like creating transactions or issuing refunds. Ensure that this key is never exposed in public environments.

#### Obtaining Your API Keys

You can access your API keys from your FedaPay dashboard:

* For testing, use only the **Test Keys** to protect your real customers’ data during development.

* In production, switch to **Live Keys** once your integration is validated.

#### Securing API Keys

The security of your API keys is paramount for protecting your transactions and customer information. Here are some best practices to follow:

* **Keep Secret Keys Confidential**: Never share your secret keys and limit their access only to the systems and users that need them.

* **Secure Storage**: Ensure that your API keys are never included in version control systems (such as Git) or in files that could be publicly accessible.

* **Key Rotation**: If you suspect an API key has been compromised, immediately regenerate it from the FedaPay dashboard. The compromised key will be disabled, and a new one will be issued.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.