import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

//IConfig
const config = new pulumi.Config();
const appName = config.require('appName');
const appEnvironment = config.require('appEnvironment');

// Create an AWS resource (S3 Bucket)
const bucket = new aws.s3.Bucket('pulumi-dev-bucket');

// //Get AMI
// const ami = pulumi.output(
//   aws.ec2.getAmi({
//     filters: [
//       {
//         name: 'name',
//         values: ['amzn-ami-hvm-*'],
//       },
//     ],
//     owners: ['amazon'],
//     mostRecent: true,
//   }),
// );
//
// //Create an EC2
// const server = new aws.ec2.Instance('pulumiServer', {
//   instanceType: 't2.micro',
//   ami: ami.id,
// });

//Setup IamInstanceProfile
export const instanceProfileRole = new aws.iam.Role(`${appName}-ed-ec2-role`, {
  name: `${appName}-eb-ec2-role`,
  description: 'Role for EC2 managed by EB',
  assumeRolePolicy: JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'sts:AssumeRole',
        Principal: {
          Service: 'ec2.amazonaws.com',
        },
        Effect: 'Allow',
        Sid: '',
      },
    ],
  }),
});

// Attach the policies for the IAM Instance Profile
const rolePolicyAttachment_ec2 = new aws.iam.RolePolicyAttachment(
  `${appName}-role-policy-attachment-ec2-ecr`,
  {
    role: instanceProfileRole.name,
    policyArn: 'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly',
  },
);

const rolePolicyAttachment_worker = new aws.iam.RolePolicyAttachment(
    `${appName}-role-policy-attachment-worker`,
    {
      role: instanceProfileRole.name,
      policyArn: "arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier"
    }
);

export const instanceProfile = new aws.iam.InstanceProfile(
    `${appName}-eb-ec2-instance-profile`,
    {
      role: instanceProfileRole.name
    }
);

// (3-2) Setup ServiceRole
export const serviceRole = new aws.iam.Role(
    `${appName}-elasticbeanstalk-service-role`,
    {
      name: `${appName}-elasticbeanstalk-service-role`,
      description: "Role trusted by Elastic Beanstalk",
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Condition: {
              StringEquals: {
                "sts:ExternalId": "elasticbeanstalk"
              }
            },
            Principal: {
              Service: "elasticbeanstalk.amazonaws.com"
            },
            Effect: "Allow",
            Sid: ""
          }
        ]
      })
    }
);

// Attach the policies for the Service Role
const rolePolicyAttachment_ebHealth = new aws.iam.RolePolicyAttachment(
    `${appName}-role-policy-attachment-eb-enhanced-health`,
    {
      role: serviceRole.name,
      policyArn:
          "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth"
    }
);

const rolePolicyAttachment_ebService = new aws.iam.RolePolicyAttachment(
    `${appName}-role-policy-attachment-eb-service`,
    {
      role: serviceRole.name,
      policyArn: "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService"
    }
);

// (4) Elastic Beanstalk Application
export const app = new aws.elasticbeanstalk.Application(`${appName}-service`, {
  name: `${appName}-service`,
  description: "",
  tags: {}
});

// (5) Elastic Beanstalk Environment
export const ebEnvironment = new aws.elasticbeanstalk.Environment(
    `${appEnvironment}-${appName}`,
    {
      name: `${appEnvironment}-${appName}`, // A unique name for this environment. This name is used in the application URL
      application: app.name,
      solutionStackName:
          "64bit Amazon Linux 2 v3.4.8 running Docker",
      settings: [
        // "Modify Security" in the console
        {
          name: "ServiceRole",
          namespace: "aws:elasticbeanstalk:environment",
          value: serviceRole.name
        },
        {
          name: "IamInstanceProfile",
          namespace: "aws:autoscaling:launchconfiguration",
          value: instanceProfile.name
        },
        {
          name: "InstanceType",
          namespace: "aws:autoscaling:launchconfiguration",
          value: config.require("instanceType")
        },
        // Modify Monitoring
        {
          name: "SystemType",
          namespace: "aws:elasticbeanstalk:healthreporting:system",
          value: "enhanced" // Default - "basic"
        }
      ]
    }
);

// Export the name of the bucket
export const bucketName = bucket.id;

//Export publicIP from EC2 server
// export const publicIP = server.publicIp;
