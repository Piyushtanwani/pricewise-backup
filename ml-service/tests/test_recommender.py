import os
import pytest
from models.recommender import ContentBasedRecommender

CATALOG_PATH = os.path.join(os.path.dirname(__file__), '../artifacts/catalog_dataset.json')

@pytest.fixture(scope="module")
def recommender():
    assert os.path.exists(CATALOG_PATH), "catalog_dataset.json must exist"
    return ContentBasedRecommender(CATALOG_PATH)

def test_recommender_initialization(recommender):
    assert len(recommender.products) > 0
    assert recommender.feature_matrix is not None
    assert recommender.similarity_matrix is not None

def test_alternatives_excludes_self(recommender):
    first_product = recommender.products[0]
    pid = first_product['id']
    alts = recommender.find_alternatives(pid, limit=4)

    # Must not contain the target product itself
    assert all(a['product_id'] != pid for a in alts)

def test_alternatives_same_category(recommender):
    first_product = recommender.products[0]
    target_category = first_product.get('category')
    alts = recommender.find_alternatives(first_product['id'], limit=4)

    for a in alts:
        alt_product = recommender.product_map.get(a['product_id'])
        assert alt_product['category'] == target_category

def test_alternatives_tradeoff_explanation(recommender):
    first_product = recommender.products[0]
    alts = recommender.find_alternatives(first_product['id'], limit=4)

    if alts:
        assert 'similarity_score' in alts[0]
        assert 'tradeoff_explanation' in alts[0]
        assert isinstance(alts[0]['tradeoff_explanation'], str)

def test_missing_specs_resilience(recommender):
    # Dummy product with zero techSpecs and empty specs list
    dummy_product = {
        "id": "dummy-no-specs-phone",
        "name": "Generic Feature Phone",
        "brand": "Generic",
        "category": "Mobiles",
        "specs": [],
        "techSpecs": {},
        "bestPrice": 12000.0,
        "mrp": 14000.0
    }
    features = recommender._parse_product_features(dummy_product)
    assert features["ram"] > 0
    assert features["storage"] > 0
    assert features["battery"] > 0
    assert features["screen"] > 0
    assert features["price"] == 12000.0

def test_scale_sensitivity_and_price_banding(recommender):
    # Budget phone must not recommend an ultra-luxury flagship (e.g. ₹15,000 phone should not recommend ₹1,50,000 phone)
    budget_products = [p for p in recommender.products if (p.get('bestPrice') or 0) <= 20000]
    if budget_products:
        pid = budget_products[0]['id']
        p_price = budget_products[0]['bestPrice']
        alts = recommender.find_alternatives(pid, limit=5, max_price_ratio=1.4)
        for a in alts:
            alt_p = recommender.product_map[a['product_id']]
            alt_price = alt_p.get('bestPrice') or alt_p.get('mrp') or 0
            assert alt_price <= p_price * 1.5, f"Alternative price {alt_price} exceeded price band for base price {p_price}"

