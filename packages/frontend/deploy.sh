#!/bin/bash
set -e

rm -rf out
mkdir -p out/_next

# Copy static assets
cp -r .next/static out/_next/static

# Copy public assets
cp public/Logo.png out/Logo.png
cp public/favicon.svg out/favicon.svg

# Copy pre-rendered HTML pages
cp .next/server/app/index.html out/index.html

mkdir -p out/login
cp .next/server/app/login.html out/login/index.html

mkdir -p out/approvals
cp .next/server/app/approvals.html out/approvals/index.html

mkdir -p out/policies
cp .next/server/app/policies.html out/policies/index.html

mkdir -p out/policies/builder
cp .next/server/app/policies/builder.html out/policies/builder/index.html

mkdir -p out/policies/simulate
cp .next/server/app/policies/simulate.html out/policies/simulate/index.html

mkdir -p out/profiles
cp .next/server/app/profiles.html out/profiles/index.html

mkdir -p out/reports
cp .next/server/app/reports.html out/reports/index.html

mkdir -p out/reports/approvals
cp .next/server/app/reports/approvals.html out/reports/approvals/index.html

mkdir -p out/reports/budgets
cp .next/server/app/reports/budgets.html out/reports/budgets/index.html

mkdir -p out/reports/carbon
cp .next/server/app/reports/carbon.html out/reports/carbon/index.html

mkdir -p out/reports/compliance
cp .next/server/app/reports/compliance.html out/reports/compliance/index.html

mkdir -p out/reports/spend
cp .next/server/app/reports/spend.html out/reports/spend/index.html

mkdir -p out/overrides
cp .next/server/app/overrides.html out/overrides/index.html

mkdir -p out/tmc
cp .next/server/app/tmc.html out/tmc/index.html

echo "Static export complete: $(find out -name '*.html' | wc -l) HTML files"

# Deploy to S3 (sync new files first, then clean up old ones after invalidation)
echo "Uploading to S3..."
aws s3 sync out/ s3://travel-policy-platform-uk-frontend-assets/ --region eu-west-2

echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id E3DTW4UIFMGBBS --paths "/*" --region us-east-1 > /dev/null

echo "Waiting 60s for cache invalidation before cleaning old files..."
sleep 60

echo "Removing old files..."
aws s3 sync out/ s3://travel-policy-platform-uk-frontend-assets/ --delete --region eu-west-2

echo "Deployment complete!"
