# dashboard.py
import streamlit as st
import pandas as pd
import analyze
from storage import DB_FILE

# The locations data from your storage file to plot on the map
LOCATIONS = [
    {"name": "ITO Intersection", "lat": 28.62839, "lon": 77.24118},
    {"name": "Minto Bridge Underpass", "lat": 28.636414, "lon": 77.222379},
    {"name": "Moolchand Flyover", "lat": 28.5658076, "lon": 77.2341281},
    {"name": "Pul Prahladpur Underpass", "lat": 28.4991114, "lon": 77.2984488},
    {"name": "Zakhira Flyover", "lat": 28.6676521, "lon": 77.1673188},
    {"name": "AIIMS Flyover", "lat": 28.5702589, "lon": 77.2097902},
    {"name": "Dhaula Kuan", "lat": 28.5956381, "lon": 77.1628404},
    {"name": "Delhi-Gurugram Expressway (Rajokri)", "lat": 28.5111029, "lon": 77.0924585},
    {"name": "Punjabi Bagh (Club Road)", "lat": 28.6663073, "lon": 77.1251542},
    {"name": "Mukarba Chowk", "lat": 28.736791, "lon": 77.160202},
    {"name": "Shadipur", "lat": 28.651027, "lon": 77.1562196},
    {"name": "Mehrauli-Badarpur Road (Saket)", "lat": 28.5193943, "lon": 77.2083033},
    {"name": "Rohtak Road (Karampura)", "lat": 28.6703833, "lon": 77.1611086},
    {"name": "Delhi-Noida Link Road (Mayur Vihar)", "lat": 28.6034515, "lon": 77.2889146},
    {"name": "Lajpat Nagar (Ring Road)", "lat": 28.5652166, "lon": 77.244422}
]

st.set_page_config(page_title="Delhi Rain Traffic Monitor", layout="wide")
st.title("🌧️ Delhi Rain Traffic Monitor")
st.markdown("Visualizing congestion multipliers at major bottlenecks during rainstorms.")

# Sidebar controls
st.sidebar.header("Settings")
rain_threshold = st.sidebar.slider("Rain Threshold (mm/hr)", min_value=0.1, max_value=5.0, value=1.0, step=0.1)
min_confidence = st.sidebar.slider("TomTom Min Confidence", min_value=0.1, max_value=1.0, value=0.5, step=0.1)

# Cache data loading so it doesn't hit SQLite on every slider drag
@st.cache_data
def get_dashboard_data(threshold, confidence):
    df = analyze.load_samples(DB_FILE)
    if df.empty:
        return None
    
    try:
        # Run your existing logic
        summary = analyze.compute_multipliers(df, rain_threshold_mm=threshold, min_confidence=confidence)
        
        # Merge the coordinates for mapping
        coords_df = pd.DataFrame(LOCATIONS)
        merged = summary.reset_index().merge(coords_df, left_on="location_name", right_on="name")
        return merged
    except RuntimeError as e:
        # Catches your custom error when buckets don't have enough data
        st.error(str(e))
        return None

# Render the Dashboard
data = get_dashboard_data(rain_threshold, min_confidence)

if data is not None:
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.subheader("Map of Chokepoints")
        st.markdown("*(Larger red dots indicate a higher traffic multiplier during rain)*")
        
        # Scale the dot size based on the multiplier severity for the map
        data['dot_size'] = data['avg_multiplier'] * 150 
        st.map(data, latitude='lat', longitude='lon', size='dot_size', color='#ff0000')

    with col2:
        st.subheader("Top Multipliers")
        # Display as a clean dataframe sorted by highest multiplier
        display_df = data[['location_name', 'avg_multiplier', 'buckets_compared']].sort_values('avg_multiplier', ascending=False)
        st.dataframe(display_df, use_container_width=True, hide_index=True)
        
    st.subheader("Multiplier Bar Chart")
    st.bar_chart(data, x="location_name", y="avg_multiplier")
else:
    st.info("Waiting for enough data across both rain and dry conditions to generate comparisons. Ensure your `collector.py` daemon is running!")