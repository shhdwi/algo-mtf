#!/bin/bash

# Manual Trading API - Test Script
# This script provides a simple way to test the manual trading API

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
ENDPOINT="$API_URL/api/trading/manual-trade"

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Function to place a BUY order
place_buy_order() {
    local user_id=$1
    local symbol=$2
    local quantity=$3
    local price=$4
    
    print_info "Placing BUY order for $symbol..."
    
    payload=$(cat <<EOF
{
  "user_id": "$user_id",
  "symbol": "$symbol",
  "transaction_type": "BUY"
EOF
)
    
    # Add optional parameters
    if [ -n "$quantity" ]; then
        payload="$payload,\n  \"quantity\": $quantity,\n  \"calculate_position_size\": false"
    fi
    
    if [ -n "$price" ]; then
        payload="$payload,\n  \"price\": $price"
    fi
    
    payload="$payload,\n  \"order_reason\": \"Test BUY order from script\"\n}"
    
    response=$(curl -s -X POST "$ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "$(echo -e "$payload")")
    
    echo "$response" | jq '.'
    
    if echo "$response" | jq -e '.success == true' > /dev/null; then
        print_success "BUY order placed successfully!"
        echo "$response" | jq -r '.data.order.order_id' > /tmp/last_order_id.txt
    else
        print_error "BUY order failed!"
    fi
}

# Function to place a SELL order
place_sell_order() {
    local user_id=$1
    local symbol=$2
    local quantity=$3
    
    print_info "Placing SELL order for $symbol..."
    
    payload=$(cat <<EOF
{
  "user_id": "$user_id",
  "symbol": "$symbol",
  "transaction_type": "SELL"
EOF
)
    
    # Add optional quantity
    if [ -n "$quantity" ]; then
        payload="$payload,\n  \"quantity\": $quantity"
    fi
    
    payload="$payload,\n  \"order_reason\": \"Test SELL order from script\"\n}"
    
    response=$(curl -s -X POST "$ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "$(echo -e "$payload")")
    
    echo "$response" | jq '.'
    
    if echo "$response" | jq -e '.success == true' > /dev/null; then
        print_success "SELL order placed successfully!"
    else
        print_error "SELL order failed!"
    fi
}

# Function to test connectivity
test_connection() {
    print_info "Testing API connectivity..."
    
    response=$(curl -s -X POST "$ENDPOINT" \
        -H "Content-Type: application/json" \
        -d '{}')
    
    if echo "$response" | grep -q "user_id is required"; then
        print_success "API is reachable and responding correctly"
        return 0
    else
        print_error "API is not responding correctly"
        echo "$response"
        return 1
    fi
}

# Display usage
usage() {
    cat << EOF
${GREEN}Manual Trading API - Test Script${NC}

Usage:
    $0 [command] [options]

Commands:
    test                    Test API connectivity
    buy USER_ID SYMBOL      Place a BUY order (auto-calculated quantity)
    buy USER_ID SYMBOL QTY  Place a BUY order with specific quantity
    sell USER_ID SYMBOL     Place a SELL order (exit position)
    
Environment Variables:
    API_URL                 Base URL for API (default: http://localhost:3000)

Examples:
    # Test connection
    $0 test
    
    # Buy RELIANCE with auto-calculated quantity
    $0 buy a1b2c3d4-e5f6-7890-abcd-ef1234567890 RELIANCE
    
    # Buy 5 shares of TCS
    $0 buy a1b2c3d4-e5f6-7890-abcd-ef1234567890 TCS 5
    
    # Sell RELIANCE (exit position)
    $0 sell a1b2c3d4-e5f6-7890-abcd-ef1234567890 RELIANCE
    
    # Use production API
    API_URL=https://your-domain.vercel.app $0 buy USER_ID RELIANCE

Prerequisites:
    - jq (JSON processor) must be installed
    - curl must be installed
    
To install jq:
    macOS:    brew install jq
    Ubuntu:   sudo apt-get install jq
    
EOF
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    print_error "jq is not installed. Please install it first."
    echo "macOS: brew install jq"
    echo "Ubuntu: sudo apt-get install jq"
    exit 1
fi

# Main script logic
case "$1" in
    test)
        test_connection
        ;;
    buy)
        if [ -z "$2" ] || [ -z "$3" ]; then
            print_error "Missing required arguments"
            usage
            exit 1
        fi
        place_buy_order "$2" "$3" "$4" "$5"
        ;;
    sell)
        if [ -z "$2" ] || [ -z "$3" ]; then
            print_error "Missing required arguments"
            usage
            exit 1
        fi
        place_sell_order "$2" "$3" "$4"
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        print_error "Unknown command: $1"
        usage
        exit 1
        ;;
esac

