use reqwest::blocking::{Client, ClientBuilder, RequestBuilder};

pub const ANTENNABENCH_USER_AGENT: &str = concat!(
    "AntennaBench/",
    env!("CARGO_PKG_VERSION"),
    " (+https://antennabench.com)"
);

pub fn client_builder() -> ClientBuilder {
    Client::builder().user_agent(ANTENNABENCH_USER_AGENT)
}

pub fn get(client: &Client, url: &str) -> RequestBuilder {
    client
        .get(url)
        .header(reqwest::header::USER_AGENT, ANTENNABENCH_USER_AGENT)
}

#[cfg(test)]
mod tests {
    use reqwest::header::USER_AGENT;

    use super::*;

    #[test]
    fn outbound_requests_identify_the_versioned_project() {
        let client = client_builder().build().unwrap();
        let request = get(&client, "https://example.com").build().unwrap();

        assert_eq!(
            request.headers().get(USER_AGENT).unwrap(),
            ANTENNABENCH_USER_AGENT
        );
        assert_eq!(
            ANTENNABENCH_USER_AGENT,
            concat!(
                "AntennaBench/",
                env!("CARGO_PKG_VERSION"),
                " (+https://antennabench.com)"
            )
        );
    }
}
